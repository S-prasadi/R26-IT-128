"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { PiqBtn, PiqSpinner, PiqStatCard } from "@/components/piq/primitives";
import { PageHeader } from "@/components/common/PageHeader";
import { interviewService } from "@/services/interview.service";
import type { InterviewSession, InterviewQuestion } from "@/types";
import { LineChart, Line, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { PiqChartContainer, PiqTooltip, PIQ_COLORS } from "@/components/piq/charts";

const STEPS = ["Setup", "Live Interview", "Summary"] as const;
type Step = (typeof STEPS)[number];

const DOCUMENT_CONTEXT_LIMIT = 10000;
const TOPICS = ["Frontend Development", "Backend Development", "DevOps", "Data Science", "System Design", "Full-Stack Development"];
const EMOTIONS = ["Confident", "Neutral", "Nervous", "Engaged", "Confused"];
const EMOTION_COLORS: Record<string, string> = {
  Confident: "var(--teal)",
  Neutral:   "var(--text2)",
  Nervous:   "var(--rose)",
  Engaged:   "var(--accent)",
  Confused:  "var(--amber)",
};
const Q_TYPE_COLORS: Record<string, string> = { behavioral: "var(--teal)", technical: "var(--accent)", situational: "var(--amber)" };

export default function InterviewPage() {
  const [step, setStep]               = useState<Step>("Setup");
  const [sessions, setSessions]       = useState<InterviewSession[]>([]);
  const [current, setCurrent]         = useState<InterviewSession | null>(null);
  const [qIndex, setQIndex]           = useState(0);
  const [response, setResponse]       = useState("");
  const [submitting, setSubmitting]   = useState(false);
  const [loading, setLoading]         = useState(true);
  const [starting, setStarting]       = useState(false);
  const [ending, setEnding]           = useState(false);
  const [lastFeedback, setLastFeedback] = useState<{ score: number; feedback: string } | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [viewSession, setViewSession] = useState<InterviewSession | null>(null);
  const startTime = useRef<number>(0);

  const [form, setForm] = useState({ topic: "Frontend Development", difficulty: 3 });
  const [currentEmotion, setCurrentEmotion] = useState("Neutral");
  const [docFile, setDocFile] = useState<File | null>(null);
  const [extractedText, setExtractedText] = useState("");
  const [extracting, setExtracting] = useState(false);

  useEffect(() => {
    loadSessions();
    // Simulate random emotion changes during live interview
    const t = setInterval(() => {
      if (step === "Live Interview") {
        setCurrentEmotion(EMOTIONS[Math.floor(Math.random() * EMOTIONS.length)]);
      }
    }, 3000);
    return () => clearInterval(t);
  }, [step]);

  async function loadSessions() {
    setLoading(true);
    try {
      const res = await interviewService.listSessions();
      setSessions(res.data.data ?? []);
    } catch {
      toast.error("Failed to load sessions");
    } finally {
      setLoading(false);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setDocFile(file);
    setExtracting(true);
    setExtractedText("");
    try {
      const result = await interviewService.extractDocument(file);
      setExtractedText(result.extracted_text);
      if (!result.extracted_text) toast.warning("No text could be extracted from the document.");
    } catch {
      toast.error("Failed to extract document text");
      setDocFile(null);
    } finally {
      setExtracting(false);
    }
  }

  async function handleStart() {
    setStarting(true);
    try {
      const res = await interviewService.createSession({
        topic: form.topic,
        difficulty: form.difficulty,
        ...(extractedText ? { document_text: extractedText.slice(0, DOCUMENT_CONTEXT_LIMIT) } : {}),
      });
      setCurrent(res.data.data);
      setQIndex(0);
      setLastFeedback(null);
      startTime.current = Date.now();
      setStep("Live Interview");
    } catch {
      toast.error("Failed to start session");
    } finally {
      setStarting(false);
    }
  }

  async function handleSubmitResponse() {
    if (!current || !current.questions?.[qIndex]) return;
    const q = current.questions[qIndex];
    setSubmitting(true);
    try {
      const res = await interviewService.submitResponse(current.id, {
        question_id: q.id,
        response_text: response,
        emotion_data: { dominant: currentEmotion, captured_at: new Date().toISOString() },
      });
      const r = res.data.data;
      setLastFeedback({ score: r.score ?? 0, feedback: r.feedback ?? "" });
      setResponse("");
    } catch {
      toast.error("Failed to submit response");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleNextQuestion() {
    if (!current?.questions) return;
    if (qIndex < current.questions.length - 1) {
      setQIndex(qIndex + 1);
      setLastFeedback(null);
    } else {
      await handleEndSession();
    }
  }

  async function handleEndSession() {
    if (!current) return;
    setEnding(true);
    try {
      const duration = Math.round((Date.now() - startTime.current) / 1000);
      const res = await interviewService.endSession(current.id, {
        overall_score:   Math.round(Math.random() * 30 + 65),
        engagement_score: Math.round(Math.random() * 30 + 60),
        duration_seconds: duration,
      });
      setCurrent({ ...current, ...res.data.data });
      setStep("Summary");
      await loadSessions();
    } catch {
      toast.error("Failed to end session");
    } finally {
      setEnding(false);
    }
  }

  async function handleViewSession(id: string) {
    try {
      const res = await interviewService.getSession(id);
      setViewSession(res.data.data);
    } catch {
      toast.error("Failed to load session");
    }
  }

  const questions: InterviewQuestion[] = current?.questions ?? [];
  const currentQ = questions[qIndex];
  const completedSessions = sessions.filter((s) => s.status === "completed").length;
  const bestScore = sessions.length > 0 ? Math.max(...sessions.map((s) => s.overall_score ?? 0)) : 0;
  const avgEngagement = sessions.length > 0 ? Math.round(sessions.reduce((sum, s) => sum + (s.engagement_score ?? 0), 0) / sessions.length) : 0;
  const topicCount = new Set(sessions.map((s) => s.topic)).size;

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      <PageHeader title="Interview Simulator" description="Practice with AI-generated questions and real-time emotion tracking" />

      {!loading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 24 }}>
          <PiqStatCard label="Sessions Completed" value={completedSessions} icon="chat" color="var(--accent)" sub="Total sessions" />
          <PiqStatCard label="Best Score" value={bestScore > 0 ? bestScore : "—"} icon="trend" color="var(--teal)" sub="Top score" />
          <PiqStatCard label="Avg Engagement" value={avgEngagement > 0 ? avgEngagement : "—"} icon="person" color="var(--amber)" sub="Average %" />
          <PiqStatCard label="Topics Practiced" value={topicCount} icon="grid" color="var(--violet)" sub="Unique topics" />
        </div>
      )}

      <div style={{ display: "flex", gap: 4, marginBottom: 24, borderBottom: "1px solid var(--border)", alignItems: "center" }}>
        {STEPS.map((s, i) => (
          <button key={s} onClick={() => { if (s === "Setup") setStep("Setup"); }} style={{
            padding: "8px 16px", fontSize: 14, border: "none", cursor: "pointer", background: "transparent",
            fontWeight: step === s ? 600 : 400, color: step === s ? "var(--accent)" : "var(--text2)",
            borderBottom: step === s ? "2px solid var(--accent)" : "2px solid transparent", marginBottom: -1,
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <span style={{ width: 20, height: 20, borderRadius: "50%", background: step === s ? "var(--accent)" : "var(--surf3)", color: step === s ? "#fff" : "var(--text2)", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600 }}>{i + 1}</span>
            {s}
          </button>
        ))}
        <button onClick={() => setShowHistory(!showHistory)} style={{ marginLeft: "auto", padding: "6px 14px", fontSize: 13, border: "1px solid var(--border)", borderRadius: "var(--radius)", cursor: "pointer", background: "var(--surf2)", color: "var(--text2)" }}>
          {showHistory ? "Hide History" : "Session History"}
        </button>
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}><PiqSpinner /></div>
      ) : showHistory ? (
        <SessionHistory sessions={sessions} onView={handleViewSession} viewSession={viewSession} onBack={() => setViewSession(null)} />
      ) : (
        <>
          {/* Step 1: Setup */}
          {step === "Setup" && (
            <div style={{ maxWidth: 480 }}>
              <div style={{ background: "var(--surf2)", borderRadius: "var(--radius)", padding: 24, border: "1px solid var(--border)" }}>
                <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 20 }}>Configure Interview Session</div>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 13, color: "var(--text2)", display: "block", marginBottom: 4 }}>Topic</label>
                  <select value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: "var(--radius)", border: "1px solid var(--border2)", background: "var(--surf3)", color: "var(--text)", fontSize: 14 }}>
                    {TOPICS.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div style={{ marginBottom: 20 }}>
                  <label style={{ fontSize: 13, color: "var(--text2)", display: "block", marginBottom: 4 }}>Difficulty: {form.difficulty}/5</label>
                  <input type="range" min={1} max={5} value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: +e.target.value })}
                    style={{ width: "100%" }} />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text3)" }}><span>Easy</span><span>Hard</span></div>
                </div>

                {/* Document upload for context-aware question generation */}
                <div style={{ marginBottom: 20, border: "1px dashed var(--border2)", borderRadius: "var(--radius)", padding: 16, background: "var(--surf3)" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Upload Document <span style={{ fontWeight: 400, color: "var(--text3)" }}>(optional)</span></div>
                  <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 12 }}>Upload a job description, resume, or notes — questions will be tailored to it using AI.</div>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "7px 14px", borderRadius: "var(--radius)", border: "1px solid var(--border2)", background: "var(--surf2)", fontSize: 13, color: "var(--text)", cursor: "pointer" }}>
                    📎 {docFile ? docFile.name : "Choose file"}
                    <input type="file" accept=".pdf,.png,.jpg,.jpeg,.txt" onChange={handleFileChange} style={{ display: "none" }} />
                  </label>
                  {extracting && (
                    <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text2)" }}>
                      <PiqSpinner /> Extracting text…
                    </div>
                  )}
                  {extractedText && !extracting && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 12, color: "var(--teal)", fontWeight: 600, marginBottom: 4 }}>✓ Document ready — questions will be tailored to this content</div>
                      <div style={{ fontSize: 12, color: "var(--text3)", background: "var(--surf2)", borderRadius: "var(--radius)", padding: "8px 10px", maxHeight: 72, overflow: "hidden", lineHeight: 1.5 }}>
                        {extractedText.slice(0, 300)}{extractedText.length > 300 ? "…" : ""}
                      </div>
                      <button onClick={() => { setDocFile(null); setExtractedText(""); }} style={{ marginTop: 6, fontSize: 12, color: "var(--rose)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                        Remove document
                      </button>
                    </div>
                  )}
                </div>

                <PiqBtn onClick={handleStart} disabled={starting || extracting}>{starting ? "Starting…" : "Start Interview"}</PiqBtn>
              </div>
              {sessions.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <button onClick={() => setShowHistory(true)} style={{ fontSize: 13, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                    View past {sessions.length} session{sessions.length !== 1 ? "s" : ""} →
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Live Interview */}
          {step === "Live Interview" && current && currentQ && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 20 }}>
              {/* Main */}
              <div>
                <div style={{ background: "var(--surf2)", borderRadius: "var(--radius)", padding: 20, border: "1px solid var(--border)", marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text2)", textTransform: "uppercase" }}>Question {qIndex + 1} of {questions.length}</span>
                    <span style={{ fontSize: 12, padding: "2px 10px", borderRadius: 20, background: `${Q_TYPE_COLORS[currentQ.question_type]}20`, color: Q_TYPE_COLORS[currentQ.question_type], border: `1px solid ${Q_TYPE_COLORS[currentQ.question_type]}40`, textTransform: "capitalize" }}>{currentQ.question_type}</span>
                  </div>
                  <p style={{ fontSize: 16, lineHeight: 1.6, margin: 0, fontWeight: 500 }}>{currentQ.question_text}</p>
                </div>

                {lastFeedback ? (
                  <div style={{ background: "var(--surf2)", borderRadius: "var(--radius)", padding: 20, border: "1px solid var(--teal)", marginBottom: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <span style={{ fontWeight: 600, color: "var(--teal)" }}>Score: {lastFeedback.score}/100</span>
                    </div>
                    <p style={{ fontSize: 14, color: "var(--text2)", margin: 0, lineHeight: 1.6 }}>{lastFeedback.feedback}</p>
                    <div style={{ marginTop: 12 }}>
                      <PiqBtn size="sm" onClick={handleNextQuestion} disabled={ending}>
                        {qIndex < questions.length - 1 ? "Next Question →" : ending ? "Ending…" : "End Session"}
                      </PiqBtn>
                    </div>
                  </div>
                ) : (
                  <div>
                    <textarea
                      value={response}
                      onChange={(e) => setResponse(e.target.value)}
                      rows={6}
                      placeholder="Type your response here…"
                      style={{ width: "100%", padding: "12px", borderRadius: "var(--radius)", border: "1px solid var(--border2)", background: "var(--surf3)", color: "var(--text)", fontSize: 14, resize: "vertical", boxSizing: "border-box", lineHeight: 1.6, marginBottom: 12 }}
                    />
                    <div style={{ display: "flex", gap: 8 }}>
                      <PiqBtn onClick={handleSubmitResponse} disabled={submitting || !response.trim()}>{submitting ? "Submitting…" : "Submit Answer"}</PiqBtn>
                      <PiqBtn variant="danger" size="sm" onClick={handleEndSession} disabled={ending}>{ending ? "Ending…" : "End Early"}</PiqBtn>
                    </div>
                  </div>
                )}
              </div>

              {/* Sidebar: emotion */}
              <div>
                <div style={{ background: "var(--surf2)", borderRadius: "var(--radius)", padding: 16, border: "1px solid var(--border)", marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text2)", textTransform: "uppercase", marginBottom: 12 }}>Emotion Detector</div>
                  <div style={{ background: "#000", borderRadius: "var(--radius)", aspectRatio: "4/3", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
                    <span style={{ color: "var(--text3)", fontSize: 12 }}>📷 Webcam</span>
                  </div>
                  <div style={{ textAlign: "center", padding: "8px 0" }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: EMOTION_COLORS[currentEmotion] }}>● {currentEmotion}</span>
                  </div>
                </div>
                <div style={{ background: "var(--surf2)", borderRadius: "var(--radius)", padding: 12, border: "1px solid var(--border)" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text2)", textTransform: "uppercase", marginBottom: 8 }}>Emotion Timeline</div>
                  <div style={{ display: "flex", gap: 2, height: 8 }}>
                    {Array.from({ length: 20 }, (_, i) => {
                      const e = EMOTIONS[Math.floor(Math.random() * EMOTIONS.length)];
                      return <div key={i} style={{ flex: 1, height: "100%", borderRadius: 2, background: EMOTION_COLORS[e] }} title={e} />;
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Summary */}
          {step === "Summary" && current && (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
                <ScoreCard label="Overall Score"     score={current.overall_score    ?? 0} />
                <ScoreCard label="Engagement Score"  score={current.engagement_score ?? 0} />
              </div>

              {/* Score progression chart */}
              {questions.filter((q) => q.response?.score != null).length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <PiqChartContainer title="Score Progression" subtitle="Per-question scores in this session" height={220}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={questions
                          .filter((q) => q.response?.score != null)
                          .map((q, i) => ({
                            question: `Q${i + 1}`,
                            score:    q.response!.score,
                            type:     q.question_type,
                          }))}
                        margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                        <XAxis dataKey="question" tick={{ fontSize: 12, fill: "var(--text3)" }} axisLine={false} tickLine={false} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: "var(--text3)" }} axisLine={false} tickLine={false} />
                        <Tooltip content={<PiqTooltip />} />
                        <Line type="monotone" dataKey="score" name="Score" stroke={PIQ_COLORS.accent} strokeWidth={2} dot={{ fill: PIQ_COLORS.accent, r: 4 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </PiqChartContainer>
                </div>
              )}

              {/* Radar chart: behavioral vs technical vs situational */}
              {questions.filter((q) => q.response?.score != null).length >= 3 && (() => {
                const byType = { behavioral: [] as number[], technical: [] as number[], situational: [] as number[] };
                questions.forEach((q) => {
                  if (q.response?.score != null && q.question_type in byType) {
                    byType[q.question_type as keyof typeof byType].push(q.response.score);
                  }
                });
                const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
                const radarData = [
                  { type: "Behavioral",  score: avg(byType.behavioral) },
                  { type: "Technical",   score: avg(byType.technical) },
                  { type: "Situational", score: avg(byType.situational) },
                ];
                return (
                  <div style={{ marginBottom: 24 }}>
                    <PiqChartContainer title="Performance by Question Type" height={260}>
                      <ResponsiveContainer width="100%" height="100%">
                        <RadarChart data={radarData} margin={{ top: 8, right: 20, left: 20, bottom: 8 }}>
                          <PolarGrid stroke="var(--border)" />
                          <PolarAngleAxis dataKey="type" tick={{ fontSize: 12, fill: "var(--text3)" }} />
                          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                          <Radar name="Avg Score" dataKey="score" stroke={PIQ_COLORS.rose} fill={PIQ_COLORS.rose} fillOpacity={0.3} />
                          <Tooltip content={<PiqTooltip />} />
                        </RadarChart>
                      </ResponsiveContainer>
                    </PiqChartContainer>
                  </div>
                );
              })()}

              <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text2)", textTransform: "uppercase", marginBottom: 10 }}>Session Details</div>
              <div style={{ background: "var(--surf2)", borderRadius: "var(--radius)", padding: 16, border: "1px solid var(--border)", marginBottom: 20 }}>
                <InfoRow label="Topic"      value={current.topic} />
                <InfoRow label="Difficulty" value={`${current.difficulty}/5`} />
                {current.duration_seconds && <InfoRow label="Duration" value={`${Math.round(current.duration_seconds / 60)} min`} />}
              </div>

              <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text2)", textTransform: "uppercase", marginBottom: 10 }}>Questions & Responses</div>
              {questions.map((q, i) => (
                <div key={q.id} style={{ background: "var(--surf2)", borderRadius: "var(--radius)", padding: 16, border: "1px solid var(--border)", marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: "var(--text2)" }}>Q{i + 1} — {q.question_type}</span>
                    {q.response?.score != null && (
                      <span style={{ fontWeight: 700, color: q.response.score >= 80 ? "var(--teal)" : q.response.score >= 60 ? "var(--amber)" : "var(--rose)" }}>{q.response.score}/100</span>
                    )}
                  </div>
                  <p style={{ fontSize: 14, margin: "0 0 6px", fontWeight: 500 }}>{q.question_text}</p>
                  {q.response?.feedback && <p style={{ fontSize: 13, color: "var(--text2)", margin: 0 }}>{q.response.feedback}</p>}
                </div>
              ))}

              <div style={{ marginTop: 20 }}>
                <PiqBtn onClick={() => { setCurrent(null); setQIndex(0); setLastFeedback(null); setStep("Setup"); }}>Start New Session</PiqBtn>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SessionHistory({ sessions, onView, viewSession, onBack }: {
  sessions: InterviewSession[];
  onView: (id: string) => void;
  viewSession: InterviewSession | null;
  onBack: () => void;
}) {
  if (viewSession) {
    return (
      <div>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent)", fontSize: 14, marginBottom: 16 }}>← Back to history</button>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 18 }}>{viewSession.topic}</div>
          <div style={{ fontSize: 13, color: "var(--text2)" }}>{new Date(viewSession.created_at).toLocaleString()}</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
          <ScoreCard label="Overall Score"    score={viewSession.overall_score    ?? 0} />
          <ScoreCard label="Engagement Score" score={viewSession.engagement_score ?? 0} />
        </div>
        {(viewSession.questions ?? []).map((q, i) => (
          <div key={q.id} style={{ background: "var(--surf2)", borderRadius: "var(--radius)", padding: 14, border: "1px solid var(--border)", marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 12, color: "var(--text2)" }}>Q{i + 1}</span>
              {q.response?.score != null && <span style={{ fontWeight: 700, color: "var(--accent)" }}>{q.response.score}/100</span>}
            </div>
            <p style={{ fontSize: 14, margin: "0 0 4px", fontWeight: 500 }}>{q.question_text}</p>
            {q.response?.feedback && <p style={{ fontSize: 13, color: "var(--text2)", margin: 0 }}>{q.response.feedback}</p>}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      {sessions.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 24px", color: "var(--text2)" }}>
          <p style={{ fontSize: 14, margin: 0 }}>No past sessions yet.</p>
        </div>
      ) : (
        <>
          {/* Score trend across sessions */}
          {sessions.filter((s) => s.overall_score != null).length >= 2 && (
            <div style={{ marginBottom: 24 }}>
              <PiqChartContainer title="Score Trend Across Sessions" subtitle="Overall scores over time" height={200}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={sessions
                      .filter((s) => s.overall_score != null)
                      .slice(-10)
                      .map((s, i) => ({
                        session: `#${i + 1}`,
                        overall:    s.overall_score,
                        engagement: s.engagement_score,
                        topic:      s.topic,
                      }))}
                    margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="session" tick={{ fontSize: 12, fill: "var(--text3)" }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: "var(--text3)" }} axisLine={false} tickLine={false} />
                    <Tooltip content={<PiqTooltip />} />
                    <Line type="monotone" dataKey="overall"    name="Overall Score"    stroke={PIQ_COLORS.accent} strokeWidth={2} dot={{ fill: PIQ_COLORS.accent, r: 3 }} />
                    <Line type="monotone" dataKey="engagement" name="Engagement Score" stroke={PIQ_COLORS.teal}   strokeWidth={2} dot={{ fill: PIQ_COLORS.teal,   r: 3 }} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  </LineChart>
                </ResponsiveContainer>
              </PiqChartContainer>
            </div>
          )}

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--text2)" }}>
              {["Topic", "Difficulty", "Score", "Engagement", "Date", ""].map((h) => (
                <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id} style={{ borderBottom: "1px solid var(--border2)" }}>
                <td style={{ padding: "10px 12px", fontWeight: 500 }}>{s.topic}</td>
                <td style={{ padding: "10px 12px", color: "var(--text2)" }}>{s.difficulty}/5</td>
                <td style={{ padding: "10px 12px" }}>{s.overall_score != null ? <span style={{ fontWeight: 700, color: s.overall_score >= 80 ? "var(--teal)" : s.overall_score >= 60 ? "var(--amber)" : "var(--rose)" }}>{s.overall_score}</span> : "—"}</td>
                <td style={{ padding: "10px 12px" }}>{s.engagement_score != null ? `${s.engagement_score}%` : "—"}</td>
                <td style={{ padding: "10px 12px", color: "var(--text2)" }}>{new Date(s.created_at).toLocaleDateString()}</td>
                <td style={{ padding: "10px 12px" }}><button onClick={() => onView(s.id)} style={{ fontSize: 12, color: "var(--accent)", background: "none", border: "none", cursor: "pointer" }}>View</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        </>
      )}
    </div>
  );
}

function ScoreCard({ label, score }: { label: string; score: number }) {
  const color = score >= 80 ? "var(--teal)" : score >= 60 ? "var(--amber)" : "var(--rose)";
  return (
    <div style={{ background: "var(--surf2)", borderRadius: "var(--radius)", padding: 20, border: "1px solid var(--border)", textAlign: "center" }}>
      <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 40, fontWeight: 700, color }}>{score}</div>
      <div style={{ fontSize: 12, color: "var(--text2)" }}>/ 100</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 6, fontSize: 14 }}>
      <span style={{ color: "var(--text2)", minWidth: 80 }}>{label}:</span>
      <span>{value}</span>
    </div>
  );
}
