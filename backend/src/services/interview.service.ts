import { supabaseAdmin } from "../config/supabase";
import { AppError } from "../middlewares/error.middleware";
import { HTTP_STATUS } from "../constants/http";
import { normalizeMimeType } from "../utils/mime";
import { callPython, pythonUrls } from "./python.service";
import type {
  CreateSessionDto,
  EndSessionDto,
  SubmitResponseDto,
} from "../validations/interview.validation";

const mockQuestions = (topic: string, difficulty: number) => ({
  questions: [
    { id: "mq1", text: `Explain your experience with ${topic} development.`,             type: "behavioral",    difficulty },
    { id: "mq2", text: `Describe the most complex ${topic} project you have built.`,     type: "situational",   difficulty },
    { id: "mq3", text: `What design patterns do you commonly use in ${topic}?`,          type: "technical",     difficulty },
    { id: "mq4", text: `How do you handle performance optimisation in ${topic}?`,        type: "technical",     difficulty },
    { id: "mq5", text: `Describe a time you had to debug a critical issue in ${topic}.`, type: "behavioral",    difficulty },
  ],
});

// Curated questions for the "Try Demo" flow — real, specific interview questions
// (not templated boilerplate) so a demo session showcases the product properly.
// Kept deliberately short-answer (one sentence, factual/definitional) rather than the
// open-ended behavioral/situational style used elsewhere: those require long spoken
// answers, which are the ones most likely to get mangled by browser speech-to-text
// and unfairly tank the demo score. Each topic still ramps easy (1) to hard (5) by
// concept difficulty — so the form's difficulty slider is ignored here.
// Used only when the client explicitly opts into demo mode; never a fallback.
const DEMO_QUESTIONS: Record<string, Array<{ text: string; type: "technical" | "behavioral" | "situational"; difficulty: number }>> = {
  "Frontend Development": [
    { text: "What does CSS stand for?", type: "technical", difficulty: 1 },
    { text: "What's the difference between `let` and `var` in JavaScript?", type: "technical", difficulty: 2 },
    { text: "What is the CSS Box Model?", type: "technical", difficulty: 3 },
    { text: "What is the Virtual DOM?", type: "technical", difficulty: 4 },
    { text: "What is CSS specificity?", type: "technical", difficulty: 5 },
  ],
  "Backend Development": [
    { text: "What does API stand for?", type: "technical", difficulty: 1 },
    { text: "What's the difference between a `GET` and a `POST` request?", type: "technical", difficulty: 2 },
    { text: "What is a REST API?", type: "technical", difficulty: 3 },
    { text: "What is database indexing used for?", type: "technical", difficulty: 4 },
    { text: "What does it mean for an API endpoint to be idempotent?", type: "technical", difficulty: 5 },
  ],
  "DevOps": [
    { text: "What does CI/CD stand for?", type: "technical", difficulty: 1 },
    { text: "What's the difference between a Docker image and a Docker container?", type: "technical", difficulty: 2 },
    { text: "What is a load balancer?", type: "technical", difficulty: 3 },
    { text: "What's the difference between horizontal and vertical scaling?", type: "technical", difficulty: 4 },
    { text: "What is Infrastructure as Code?", type: "technical", difficulty: 5 },
  ],
  "Data Science": [
    { text: "What does ML stand for?", type: "technical", difficulty: 1 },
    { text: "What's the difference between supervised and unsupervised learning?", type: "technical", difficulty: 2 },
    { text: "What is overfitting in a machine learning model?", type: "technical", difficulty: 3 },
    { text: "What's the difference between precision and recall?", type: "technical", difficulty: 4 },
    { text: "What is a confusion matrix used for?", type: "technical", difficulty: 5 },
  ],
  "System Design": [
    { text: "What is a database?", type: "technical", difficulty: 1 },
    { text: "What's the difference between a SQL and a NoSQL database?", type: "technical", difficulty: 2 },
    { text: "What is caching used for in a system?", type: "technical", difficulty: 3 },
    { text: "What is database sharding?", type: "technical", difficulty: 4 },
    { text: "What is eventual consistency?", type: "technical", difficulty: 5 },
  ],
  "Full-Stack Development": [
    { text: "What's the difference between the frontend and the backend of a web application?", type: "technical", difficulty: 1 },
    { text: "What's the difference between authentication and authorization?", type: "technical", difficulty: 2 },
    { text: "What is an API endpoint?", type: "technical", difficulty: 3 },
    { text: "What is CORS?", type: "technical", difficulty: 4 },
    { text: "What is server-side rendering?", type: "technical", difficulty: 5 },
  ],
};

const demoQuestions = (topic: string) => ({
  questions: (DEMO_QUESTIONS[topic] ?? DEMO_QUESTIONS["Full-Stack Development"]!).map((q, i) => ({
    id: `demo-${i}`,
    text: q.text,
    type: q.type,
    difficulty: q.difficulty,
  })),
});

const MOCK_RESPONSE_ANALYSIS = {
  score: 72,
  feedback: "Good understanding demonstrated. Try to be more specific with concrete examples and measurable outcomes.",
  criteria: {} as Record<string, number>,
  strengths: [] as string[],
  improvements: [] as string[],
  model_answer: "",
  engagement_score: 68 as number | null,
  emotion_summary: { dominant: "Confident", distribution: { Confident: 45, Neutral: 30, Nervous: 15, Engaged: 10 } },
};

export const interviewService = {
  async listSessions(userId: string) {
    const { data, error } = await supabaseAdmin
      .from("interview_sessions")
      .select("id, topic, difficulty, status, duration_seconds, overall_score, engagement_score, started_at, ended_at, created_at, is_demo, emotion_sensitivity")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new AppError(error.message, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    return data ?? [];
  },

  async getSession(sessionId: string, userId: string) {
    const { data: session, error } = await supabaseAdmin
      .from("interview_sessions")
      .select("*")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .single();
    if (error || !session) throw new AppError("Session not found", HTTP_STATUS.NOT_FOUND);

    const { data: questions } = await supabaseAdmin
      .from("interview_questions")
      .select("id, question_text, question_type, difficulty, order_index")
      .eq("session_id", sessionId)
      .order("order_index");

    const questionIds = (questions ?? []).map((q) => q.id);
    const { data: responses } = questionIds.length
      ? await supabaseAdmin
          .from("interview_responses")
          .select("id, question_id, response_text, score, feedback, emotion_data, engagement_score, analysis, created_at")
          .in("question_id", questionIds)
      : { data: [] };

    const responseMap = new Map((responses ?? []).map((r) => [r.question_id as string, r]));
    const questionsWithResponses = (questions ?? []).map((q) => ({
      ...q,
      response: responseMap.get(q.id) ?? null,
    }));

    return { ...session, questions: questionsWithResponses };
  },

  async createSession(userId: string, dto: CreateSessionDto) {
    const { data: session, error } = await supabaseAdmin
      .from("interview_sessions")
      .insert({
        user_id:             userId,
        topic:               dto.topic,
        difficulty:          dto.difficulty,
        status:              "in_progress",
        started_at:          new Date().toISOString(),
        is_demo:             dto.demo ?? false,
        emotion_sensitivity: dto.emotion_sensitivity ?? 50,
      })
      .select("id, topic, difficulty, status, started_at, created_at, is_demo, emotion_sensitivity")
      .single();
    if (error) throw new AppError(error.message, HTTP_STATUS.BAD_REQUEST);

    const generated = dto.demo
      ? demoQuestions(dto.topic)
      : await callPython(
          `${pythonUrls.moduleD()}/generate-questions`,
          { session_id: session.id, topic: dto.topic, difficulty: dto.difficulty, skills: dto.skills ?? [], document_text: dto.document_text ?? "" },
          mockQuestions(dto.topic, dto.difficulty)
        ) as { questions: Array<{ id: string; text: string; type: string; difficulty: number }> };

    const questionRows = generated.questions.map((q, i) => ({
      session_id:    session.id,
      question_text: q.text,
      question_type: q.type ?? "technical",
      difficulty:    q.difficulty ?? dto.difficulty,
      order_index:   i,
    }));

    const { data: questions } = await supabaseAdmin
      .from("interview_questions")
      .insert(questionRows)
      .select("id, question_text, question_type, difficulty, order_index");

    return { ...session, questions: questions ?? [] };
  },

  async endSession(sessionId: string, userId: string, dto: EndSessionDto) {
    // Verify ownership and collect this session's question ids.
    const { data: owned } = await supabaseAdmin
      .from("interview_sessions")
      .select("id, interview_questions(id)")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .single();
    if (!owned) throw new AppError("Session not found", HTTP_STATUS.NOT_FOUND);

    // Derive the session totals from the real per-question scores — never trust the client.
    const questionIds = ((owned.interview_questions as Array<{ id: string }>) ?? []).map((q) => q.id);
    const { data: responses } = questionIds.length
      ? await supabaseAdmin
          .from("interview_responses")
          .select("score, engagement_score")
          .in("question_id", questionIds)
      : { data: [] as Array<{ score: number | null; engagement_score: number | null }> };

    const avg = (vals: number[]) =>
      vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
    const scores      = (responses ?? []).map((r) => r.score).filter((s): s is number => typeof s === "number");
    const engagements = (responses ?? []).map((r) => r.engagement_score).filter((s): s is number => typeof s === "number");

    const { data, error } = await supabaseAdmin
      .from("interview_sessions")
      .update({
        status:           "completed",
        overall_score:    avg(scores),
        engagement_score: avg(engagements),
        duration_seconds: dto.duration_seconds,
        ended_at:         new Date().toISOString(),
      })
      .eq("id", sessionId)
      .eq("user_id", userId)
      .select("id, topic, status, overall_score, engagement_score, ended_at")
      .single();
    if (error) throw new AppError(error.message, HTTP_STATUS.BAD_REQUEST);
    if (!data) throw new AppError("Session not found", HTTP_STATUS.NOT_FOUND);
    return data;
  },

  async predictEmotion(frame: string, sensitivity: number) {
    // Proxy a single webcam frame to Module D so the browser never talks to Python directly.
    return callPython(
      `${pythonUrls.moduleD()}/predict`,
      { frame, sensitivity },
      { face: false, interview_state: "Neutral", confidence: 0, probs: {}, bbox: null }
    );
  },

  /** opts is forwarded to callPython as-is; omit it to keep the existing
   *  default behavior (60s timeout, silent empty-text fallback on timeout —
   *  relied on by the interview-document-upload caller for graceful
   *  degradation). Pass { timeoutMs, throwOnUnreachable: true } when the
   *  caller needs a real error instead of a silently-empty result — see
   *  cv.controller.ts's attachJobPost. */
  async extractDocumentText(
    fileBuffer: Buffer,
    mimetype: string,
    opts?: { timeoutMs?: number; throwOnUnreachable?: boolean }
  ): Promise<{ extracted_text: string }> {
    const normalizedMime = normalizeMimeType(mimetype);

    if (normalizedMime === "text/plain") {
      return { extracted_text: fileBuffer.toString("utf8", 0, fileBuffer.length).trim() };
    }

    const file_b64 = fileBuffer.toString("base64");
    const result = await callPython(
      `${pythonUrls.moduleD()}/extract-ocr`,
      { file_b64, mimetype: normalizedMime },
      { text: "" },
      opts
    ) as { text: string };
    return { extracted_text: result.text ?? "" };
  },

  async submitResponse(sessionId: string, userId: string, dto: SubmitResponseDto) {
    // Verify session ownership and pull the question context for context-aware scoring.
    const { data: session } = await supabaseAdmin
      .from("interview_sessions")
      .select("id, topic, interview_questions!inner(id, question_text, question_type, difficulty)")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .eq("interview_questions.id", dto.question_id)
      .single();
    if (!session) throw new AppError("Question not found for this session", HTTP_STATUS.NOT_FOUND);
    const question = (session.interview_questions as Array<{
      id: string; question_text: string; question_type: string; difficulty: number;
    }>)[0];

    // Give the scorer the question itself — without it the LLM grades the answer in a vacuum.
    const analysis = await callPython(
      `${pythonUrls.moduleD()}/analyze-response`,
      {
        question_id:   dto.question_id,
        response_text: dto.response_text,
        question_text: question.question_text,
        question_type: question.question_type,
        topic:         session.topic,
        difficulty:    question.difficulty,
        emotion_data:  dto.emotion_data,
      },
      MOCK_RESPONSE_ANALYSIS
    ) as typeof MOCK_RESPONSE_ANALYSIS;

    const responsePayload = {
      question_id:       dto.question_id,
      response_text:     dto.response_text,
      score:             analysis.score,
      feedback:          analysis.feedback,
      engagement_score:  analysis.engagement_score,
      emotion_data:      { ...dto.emotion_data, summary: analysis.emotion_summary },
      analysis: {
        criteria:     analysis.criteria ?? {},
        strengths:    analysis.strengths ?? [],
        improvements: analysis.improvements ?? [],
        model_answer: analysis.model_answer ?? "",
      },
    };

    const { data: existing } = await supabaseAdmin
      .from("interview_responses")
      .select("id")
      .eq("question_id", dto.question_id)
      .maybeSingle();

    const query = existing
      ? supabaseAdmin
          .from("interview_responses")
          .update(responsePayload)
          .eq("id", existing.id)
      : supabaseAdmin
          .from("interview_responses")
          .insert(responsePayload);

    const { data, error } = await query
      .select("id, question_id, score, feedback, engagement_score, emotion_data, analysis, created_at")
      .single();
    if (error) throw new AppError(error.message, HTTP_STATUS.BAD_REQUEST);
    return data;
  },
};
