import { supabaseAdmin } from "../config/supabase";
import { AppError } from "../middlewares/error.middleware";
import { HTTP_STATUS } from "../constants/http";
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

const MOCK_RESPONSE_ANALYSIS = {
  score: 72,
  feedback: "Good understanding demonstrated. Try to be more specific with concrete examples and measurable outcomes.",
  engagement_score: 68,
  emotion_summary: { dominant: "Confident", distribution: { Confident: 45, Neutral: 30, Nervous: 15, Engaged: 10 } },
};

export const interviewService = {
  async listSessions(userId: string) {
    const { data, error } = await supabaseAdmin
      .from("interview_sessions")
      .select("id, topic, difficulty, status, duration_seconds, overall_score, engagement_score, started_at, ended_at, created_at")
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
          .select("id, question_id, response_text, score, feedback, emotion_data, engagement_score, created_at")
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
        user_id:    userId,
        topic:      dto.topic,
        difficulty: dto.difficulty,
        status:     "in_progress",
        started_at: new Date().toISOString(),
      })
      .select("id, topic, difficulty, status, started_at, created_at")
      .single();
    if (error) throw new AppError(error.message, HTTP_STATUS.BAD_REQUEST);

    const generated = await callPython(
      `${pythonUrls.moduleD()}/generate-questions`,
      { session_id: session.id, topic: dto.topic, difficulty: dto.difficulty, skills: dto.skills ?? [] },
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
    const { data, error } = await supabaseAdmin
      .from("interview_sessions")
      .update({
        status:          "completed",
        overall_score:   dto.overall_score,
        engagement_score: dto.engagement_score,
        duration_seconds: dto.duration_seconds,
        ended_at:        new Date().toISOString(),
      })
      .eq("id", sessionId)
      .eq("user_id", userId)
      .select("id, topic, status, overall_score, engagement_score, ended_at")
      .single();
    if (error) throw new AppError(error.message, HTTP_STATUS.BAD_REQUEST);
    if (!data) throw new AppError("Session not found", HTTP_STATUS.NOT_FOUND);
    return data;
  },

  async submitResponse(sessionId: string, userId: string, dto: SubmitResponseDto) {
    // verify session ownership
    const { data: session } = await supabaseAdmin
      .from("interview_sessions")
      .select("id")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .single();
    if (!session) throw new AppError("Session not found", HTTP_STATUS.NOT_FOUND);

    const analysis = await callPython(
      `${pythonUrls.moduleD()}/analyze-response`,
      { question_id: dto.question_id, response_text: dto.response_text, emotion_data: dto.emotion_data },
      MOCK_RESPONSE_ANALYSIS
    ) as typeof MOCK_RESPONSE_ANALYSIS;

    const { data, error } = await supabaseAdmin
      .from("interview_responses")
      .upsert(
        {
          question_id:     dto.question_id,
          response_text:   dto.response_text,
          score:           analysis.score,
          feedback:        analysis.feedback,
          engagement_score: analysis.engagement_score,
          emotion_data:    { ...dto.emotion_data, summary: analysis.emotion_summary },
        },
        { onConflict: "question_id" }
      )
      .select("id, question_id, score, feedback, engagement_score, emotion_data, created_at")
      .single();
    if (error) throw new AppError(error.message, HTTP_STATUS.BAD_REQUEST);
    return data;
  },
};
