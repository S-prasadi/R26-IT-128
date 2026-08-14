"use client";

import { useState, useEffect, useRef, type ReactNode } from "react";
import { toast } from "sonner";
import { PiqBtn, PiqSpinner, PiqStatCard } from "@/components/piq/primitives";
import { PiqBadge } from "@/components/piq/badge";
import { Icon } from "@/components/piq/icon";
import { PageHeader } from "@/components/common/PageHeader";
import { interviewService } from "@/services/interview.service";
import type { InterviewSession, InterviewQuestion } from "@/types";
import { LineChart, Line, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { PiqChartContainer, PiqTooltip, PIQ_COLORS } from "@/components/piq/charts";

const STEPS = ["Setup", "Live Interview", "Summary"] as const;
type Step = (typeof STEPS)[number];

const DOCUMENT_CONTEXT_LIMIT = 10000;
const TOPICS = ["Frontend Development", "Backend Development", "DevOps", "Data Science", "System Design", "Full-Stack Development"];
const EMOTION_COLORS: Record<string, string> = {
  Confident: "var(--teal)",
  Neutral:   "var(--text2)",
  Nervous:   "var(--rose)",
  Stressed:  "var(--rose)",
  Engaged:   "var(--accent)",
  Confused:  "var(--amber)",
};
const Q_TYPE_COLORS: Record<string, string> = { behavioral: "var(--teal)", technical: "var(--accent)", situational: "var(--amber)" };

function scoreColor(score: number | null | undefined): string {
  if (score == null) return "var(--text2)";
  return score >= 80 ? "var(--teal)" : score >= 60 ? "var(--amber)" : "var(--rose)";
}

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
  const [lastFeedback, setLastFeedback] = useState<{ score: number; feedback: string; emotion: EmotionSummary | null } | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [viewSession, setViewSession] = useState<InterviewSession | null>(null);
  const [showCustomize, setShowCustomize] = useState(false);
  const [previewState, setPreviewState] = useState<{ interview_state: string; confidence: number } | null>(null);
  const [previewError, setPreviewError] = useState("");
  const startTime = useRef<number>(0);
  const videoRef        = useRef<HTMLVideoElement>(null);
  const canvasRef       = useRef<HTMLCanvasElement>(null);
  const streamRef       = useRef<MediaStream | null>(null);
  const emotionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previewVideoRef  = useRef<HTMLVideoElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);
  const previewTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  // Per-question webcam emotion timeline, sampled ~1 fps and sent on submit.
  const emotionTimeline = useRef<Array<{ t: number; emotion: string }>>([]);
  const lastTlPush      = useRef<number>(0);
  const recognitionRef  = useRef<any>(null);
  const baseTextRef     = useRef<string>("");

  const [form, setForm] = useState({ topic: "Frontend Development", difficulty: 3, emotionSensitivity: 50 });
  const [currentEmotion, setCurrentEmotion] = useState("Neutral");
  const [cameraError, setCameraError] = useState("");
  const [docFile, setDocFile] = useState<File | null>(null);
  const [extractedText, setExtractedText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [usedVoice, setUsedVoice] = useState(false);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);

  useEffect(() => {
    loadSessions();
    const SpeechRecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognitionClass) {
      setSpeechSupported(true);
    }
  }, []);

  // Start/stop webcam when entering/leaving the Live Interview step
  useEffect(() => {
    if (step === "Live Interview") {
      startWebcam();
    } else {
      stopWebcam();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          // ignore
        }
      }
    }
    return () => stopWebcam();
  }, [step]);

  // Start/stop the calibration preview stream with the Customize popup — kept fully
  // separate from the live-interview webcam so the two MediaStreams never overlap.
  useEffect(() => {
    if (showCustomize) {
      startPreviewWebcam();
    } else {
      stopPreviewWebcam();
    }
    return () => stopPreviewWebcam();
  }, [showCustomize]);

  // Close the Customize popup on Escape
  useEffect(() => {
    if (!showCustomize) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setShowCustomize(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showCustomize]);

  // Cleanup speech recognition on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          // ignore
        }
      }
    };
  }, []);

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

  async function startWebcam() {
    setCameraError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, facingMode: "user" } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      emotionTimerRef.current = setInterval(captureAndPredict, 200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setCameraError(msg);
    }
  }

  function stopWebcam() {
    if (emotionTimerRef.current) { clearInterval(emotionTimerRef.current); emotionTimerRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    if (videoRef.current) { videoRef.current.srcObject = null; }
  }

  async function captureAndPredict() {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return;
    canvas.width  = video.videoWidth  || 320;
    canvas.height = video.videoHeight || 240;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const base64 = canvas.toDataURL("image/jpeg", 0.7).split(",")[1];
    try {
      const res = await interviewService.predictEmotion(base64, current?.emotion_sensitivity ?? form.emotionSensitivity);
      const data = res.data.data;
      if (data?.face && data.interview_state) {
        setCurrentEmotion(data.interview_state);
        // Sample into the per-question timeline at ~1 fps so engagement reflects the whole answer.
        const now = Date.now();
        if (now - lastTlPush.current >= 1000) {
          lastTlPush.current = now;
          emotionTimeline.current.push({
            t: Math.round((now - startTime.current) / 1000),
            emotion: data.interview_state,
          });
        }
      }
    } catch {
      // Backend / Module D unreachable — keep last emotion
    }
  }

  async function startPreviewWebcam() {
    setPreviewError("");
    setPreviewState(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, facingMode: "user" } });
      previewStreamRef.current = stream;
      if (previewVideoRef.current) {
        previewVideoRef.current.srcObject = stream;
      }
      previewTimerRef.current = setInterval(capturePreview, 400);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setPreviewError(msg || "Couldn't access the camera. Check your browser's camera permission.");
    }
  }

  function stopPreviewWebcam() {
    if (previewTimerRef.current) { clearInterval(previewTimerRef.current); previewTimerRef.current = null; }
    if (previewStreamRef.current) { previewStreamRef.current.getTracks().forEach((t) => t.stop()); previewStreamRef.current = null; }
    if (previewVideoRef.current) { previewVideoRef.current.srcObject = null; }
    setPreviewState(null);
  }

  async function capturePreview() {
    const video  = previewVideoRef.current;
    const canvas = previewCanvasRef.current;
    if (!video || !canvas || video.readyState < 2) return;
    canvas.width  = video.videoWidth  || 320;
    canvas.height = video.videoHeight || 240;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const base64 = canvas.toDataURL("image/jpeg", 0.7).split(",")[1];
    try {
      const res = await interviewService.predictEmotion(base64, form.emotionSensitivity);
      const data = res.data.data;
      if (data?.face && data.interview_state) {
        setPreviewState({ interview_state: data.interview_state, confidence: data.confidence });
      }
    } catch {
      // Backend / Module D unreachable — keep last preview result
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
        emotion_sensitivity: form.emotionSensitivity,
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

  async function handleStartDemo() {
    setStarting(true);
    try {
      const res = await interviewService.createSession({
        topic: form.topic,
        difficulty: form.difficulty,
        emotion_sensitivity: form.emotionSensitivity,
        demo: true,
      });
      setCurrent(res.data.data);
      setQIndex(0);
      setLastFeedback(null);
      startTime.current = Date.now();
      setStep("Live Interview");
    } catch {
      toast.error("Failed to start demo session");
    } finally {
      setStarting(false);
    }
  }

  function createRecognitionInstance(SpeechRecognitionClass: any) {
    const rec = new SpeechRecognitionClass();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";

    rec.onstart = () => {
      setIsListening(true);
    };

    rec.onresult = (event: any) => {
      let interimTranscript = "";
      let finalTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      // Commit final text into the base immediately so accumulation stays
      // correct even across future stop/start sessions on a new instance.
      if (finalTranscript) {
        baseTextRef.current = baseTextRef.current + (baseTextRef.current ? " " : "") + finalTranscript.trim();
        // Any new voice-transcribed text (re-)arms the review gate, even if a
        // prior segment was already confirmed — transcription can misfire per segment.
        setUsedVoice(true);
        setReviewConfirmed(false);
      }

      const base = baseTextRef.current;
      const currentText = base + (base && interimTranscript ? " " : "") + interimTranscript;
      setResponse(currentText);
    };

    rec.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      if (event.error === "not-allowed") {
        toast.error("Microphone permission denied. Enable microphone access in browser settings.");
      } else if (event.error !== "no-speech") {
        toast.error(`Voice typing error: ${event.error}`);
      }
      setIsListening(false);
      recognitionRef.current = null; // discard — never reuse a dead instance
    };

    rec.onend = () => {
      setIsListening(false);
      recognitionRef.current = null; // force a fresh instance on next start
    };

    return rec;
  }

  function toggleVoiceTyping() {
    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }

    const SpeechRecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionClass) {
      toast.error("Speech recognition is not supported in this browser.");
      return;
    }

    // Sync base text from the current textarea (also picks up manual edits
    // made between voice sessions), then start a brand-new instance —
    // reusing one instance across sessions is unreliable across browsers.
    baseTextRef.current = response;
    const rec = createRecognitionInstance(SpeechRecognitionClass);
    recognitionRef.current = rec;

    try {
      rec.start();
    } catch (err) {
      console.error("Failed to start speech recognition:", err);
      toast.error("Failed to start voice typing.");
      recognitionRef.current = null;
    }
  }

  async function handleSubmitResponse() {
    if (!current || !current.questions?.[qIndex]) return;
    if (usedVoice && !reviewConfirmed) {
      // First click on a voice-transcribed answer just arms the gate — the
      // banner + "Confirm & Submit" label render below, second click submits.
      setReviewConfirmed(true);
      return;
    }
    const q = current.questions[qIndex];
    setSubmitting(true);
    if (isListening && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        // ignore
      }
    }
    try {
      const res = await interviewService.submitResponse(current.id, {
        question_id: q.id,
        response_text: response,
        emotion_data: { dominant: currentEmotion, timeline: emotionTimeline.current },
      });
      const r = res.data.data;
      setLastFeedback({ score: r.score ?? 0, feedback: r.feedback ?? "", emotion: getEmotionSummary(r.emotion_data) });
      setResponse("");
      setUsedVoice(false);
      setReviewConfirmed(false);
      // Start a fresh emotion timeline for the next question.
      emotionTimeline.current = [];
      lastTlPush.current = 0;
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
      // overall_score / engagement_score are computed server-side from the real
      // per-question scores — the client only reports how long the session ran.
      await interviewService.endSession(current.id, {
        duration_seconds: duration,
      });
      // Re-fetch the full session so the Summary has each question's response
      // (score, feedback, emotion) — endSession only returns session-level fields.
      const full = await interviewService.getSession(current.id);
      setCurrent(full.data.data);
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
    <>
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
        <button onClick={() => setShowCustomize(true)} disabled={step === "Live Interview"} title="Customize emotion detection sensitivity" style={{
          marginLeft: "auto", padding: "6px 14px", fontSize: 13, border: "1px solid var(--border)", borderRadius: "var(--radius)",
          cursor: step === "Live Interview" ? "not-allowed" : "pointer", background: "var(--surf2)", color: "var(--text2)",
          opacity: step === "Live Interview" ? 0.5 : 1, display: "flex", alignItems: "center", gap: 6,
        }}>
          <Icon n="settings" s={14} /> Customize
        </button>
        <button onClick={() => setShowHistory(!showHistory)} style={{ padding: "6px 14px", fontSize: 13, border: "1px solid var(--border)", borderRadius: "var(--radius)", cursor: "pointer", background: "var(--surf2)", color: "var(--text2)" }}>
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

                <div style={{ display: "flex", gap: 8 }}>
                  <PiqBtn onClick={handleStart} disabled={starting || extracting}>{starting ? "Starting…" : "Start Interview"}</PiqBtn>
                  <PiqBtn variant="outline" onClick={handleStartDemo} disabled={starting || extracting}>Try Demo</PiqBtn>
                </div>
                <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 6 }}>
                  Try Demo skips AI question generation and jumps straight in with curated {form.topic} questions — your answers are still scored by real AI.
                </div>
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
                    <EmotionBar summary={lastFeedback.emotion} />
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
                      onChange={(e) => { setResponse(e.target.value); setReviewConfirmed(false); }}
                      rows={6}
                      placeholder="Type your response here…"
                      style={{ width: "100%", padding: "12px", borderRadius: "var(--radius)", border: "1px solid var(--border2)", background: "var(--surf3)", color: "var(--text)", fontSize: 14, resize: "vertical", boxSizing: "border-box", lineHeight: 1.6, marginBottom: 12 }}
                    />
                    {isListening && (
                      <div style={{ fontSize: 13, color: "var(--rose)", marginTop: -6, marginBottom: 10, display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ display: "flex", gap: 3, alignItems: "center", height: 16 }}>
                          <span style={{ display: "inline-block", width: 3, height: 10, background: "var(--rose)", borderRadius: 1.5, animation: "bounceBar 0.8s ease-in-out infinite alternate", transformOrigin: "bottom" }} />
                          <span style={{ display: "inline-block", width: 3, height: 16, background: "var(--rose)", borderRadius: 1.5, animation: "bounceBar 0.8s ease-in-out infinite alternate", animationDelay: "0.25s", transformOrigin: "bottom" }} />
                          <span style={{ display: "inline-block", width: 3, height: 12, background: "var(--rose)", borderRadius: 1.5, animation: "bounceBar 0.8s ease-in-out infinite alternate", animationDelay: "0.45s", transformOrigin: "bottom" }} />
                          <span style={{ display: "inline-block", width: 3, height: 7, background: "var(--rose)", borderRadius: 1.5, animation: "bounceBar 0.8s ease-in-out infinite alternate", animationDelay: "0.15s", transformOrigin: "bottom" }} />
                        </div>
                        <span style={{ fontWeight: 500 }}>Listening… Speak to transcribe.</span>
                      </div>
                    )}
                    {usedVoice && reviewConfirmed && !submitting && (
                      <div style={{ fontSize: 13, color: "var(--amber)", marginTop: -6, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                        <Icon n="info" s={14} c="var(--amber)" />
                        <span>Voice transcription can misinterpret words — please check your answer above before submitting.</span>
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <PiqBtn onClick={handleSubmitResponse} disabled={submitting || !response.trim()}>
                        {submitting ? "Submitting…" : usedVoice && reviewConfirmed ? "Confirm & Submit" : "Submit Answer"}
                      </PiqBtn>
                      {speechSupported && (
                        <PiqBtn
                          variant={isListening ? "danger" : "secondary"}
                          onClick={toggleVoiceTyping}
                          icon="mic"
                          style={isListening ? { animation: "pulse 1.5s infinite" } : undefined}
                        >
                          {isListening ? "Stop Listening" : "Voice Answer"}
                        </PiqBtn>
                      )}
                      <PiqBtn variant="danger" size="sm" onClick={handleEndSession} disabled={ending}>{ending ? "Ending…" : "End Early"}</PiqBtn>
                    </div>
                  </div>
                )}
              </div>

              {/* Sidebar: emotion */}
              <div>
                <div style={{ background: "var(--surf2)", borderRadius: "var(--radius)", padding: 16, border: "1px solid var(--border)", marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text2)", textTransform: "uppercase", marginBottom: 12 }}>Emotion Detector</div>
                  <div style={{ background: "#000", borderRadius: "var(--radius)", aspectRatio: "4/3", overflow: "hidden", position: "relative", marginBottom: 10 }}>
                    <video
                      ref={videoRef}
                      autoPlay
                      muted
                      playsInline
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    />
                    {cameraError && (
                      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
                        <span style={{ fontSize: 24 }}>📷</span>
                        <span style={{ color: "var(--text3)", fontSize: 11, textAlign: "center", padding: "0 8px" }}>Camera unavailable</span>
                      </div>
                    )}
                  </div>
                  <canvas ref={canvasRef} style={{ display: "none" }} />
                  <div style={{ textAlign: "center", padding: "8px 0" }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: EMOTION_COLORS[currentEmotion] ?? "var(--text2)" }}>● {currentEmotion}</span>
                  </div>
                  {cameraError && (
                    <div style={{ fontSize: 11, color: "var(--text3)", textAlign: "center", marginTop: 4 }}>
                      Allow camera access in Chrome settings to enable emotion detection.
                    </div>
                  )}
                </div>
                <div style={{ background: "var(--surf2)", borderRadius: "var(--radius)", padding: 12, border: "1px solid var(--border)" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text2)", textTransform: "uppercase", marginBottom: 8 }}>Emotion Timeline</div>
                  <div style={{ display: "flex", gap: 2, height: 8 }}>
                    {emotionTimeline.current.length === 0 ? (
                      <div style={{ flex: 1, height: "100%", borderRadius: 2, background: "var(--border)" }} title="Waiting for webcam…" />
                    ) : (
                      emotionTimeline.current.slice(-20).map((pt, i) => (
                        <div key={i} style={{ flex: 1, height: "100%", borderRadius: 2, background: EMOTION_COLORS[pt.emotion] ?? "var(--text2)" }} title={`${pt.emotion} @ ${pt.t}s`} />
                      ))
                    )}
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
                <QuestionReview key={q.id} q={q} index={i} />
              ))}

              <div style={{ marginTop: 20 }}>
                <PiqBtn onClick={() => { setCurrent(null); setQIndex(0); setLastFeedback(null); setStep("Setup"); }}>Start New Session</PiqBtn>
              </div>
            </div>
          )}
        </>
      )}
    </div>

    {showCustomize && (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="customize-emotion-title"
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }}
        onClick={() => setShowCustomize(false)}
      >
        <div
          style={{ background: "var(--surf2)", borderRadius: "var(--radius)", border: "1px solid var(--border)", boxShadow: "0 12px 40px rgba(0,0,0,0.35)", padding: 24, width: 380, maxWidth: "100%" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <div id="customize-emotion-title" style={{ fontWeight: 600, fontSize: 16 }}>Customize Emotion Detection</div>
            <button onClick={() => setShowCustomize(false)} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text2)", padding: 4, borderRadius: "var(--radius)", display: "flex" }}>
              <Icon n="close" s={16} />
            </button>
          </div>
          <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 16 }}>
            Adjust how easily live emotion tracking flags Nervous, Confused, or Stressed vs. staying Neutral — watch the preview to calibrate.
          </div>

          <div style={{ marginBottom: 16 }}>
            <label htmlFor="emotion-sensitivity-slider" style={{ fontSize: 13, color: "var(--text2)", display: "block", marginBottom: 4 }}>
              Emotion Detection Sensitivity: {form.emotionSensitivity}
            </label>
            <input id="emotion-sensitivity-slider" type="range" min={0} max={100} value={form.emotionSensitivity}
              onChange={(e) => setForm({ ...form, emotionSensitivity: +e.target.value })}
              style={{ width: "100%" }} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text3)" }}><span>Forgiving</span><span>Sensitive</span></div>
          </div>

          <div style={{ borderRadius: "var(--radius)", overflow: "hidden", background: "#000", position: "relative", aspectRatio: "4 / 3", marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {previewError ? (
              <div style={{ fontSize: 12, color: "var(--text3)", textAlign: "center", padding: 16 }}>{previewError}</div>
            ) : (
              <video ref={previewVideoRef} autoPlay muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            )}
            <canvas ref={previewCanvasRef} style={{ display: "none" }} />
          </div>

          {previewError ? (
            <div style={{ fontSize: 12, color: "var(--rose)" }}>Can&apos;t access the camera. Check your browser&apos;s camera permission and try again.</div>
          ) : (
            <div style={{ fontSize: 13, color: "var(--text2)" }}>
              Detected:{" "}
              <strong style={{ color: previewState ? (EMOTION_COLORS[previewState.interview_state] ?? "var(--text)") : "var(--text)" }}>
                {previewState?.interview_state ?? "Looking for a face…"}
              </strong>
              {previewState && ` (${Math.round(previewState.confidence * 100)}%)`}
            </div>
          )}
        </div>
      </div>
    )}
    </>
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
          <QuestionReview key={q.id} q={q} index={i} />
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
                <td style={{ padding: "10px 12px", fontWeight: 500 }}>
                  {s.topic}
                  {s.is_demo && <span style={{ marginLeft: 6, fontSize: 10, padding: "1px 6px", borderRadius: 8, background: "var(--surf3)", color: "var(--text2)" }}>Demo</span>}
                </td>
                <td style={{ padding: "10px 12px", color: "var(--text2)" }}>{s.difficulty}/5</td>
                <td style={{ padding: "10px 12px" }}>{s.overall_score != null ? <span style={{ fontWeight: 700, color: scoreColor(s.overall_score) }}>{s.overall_score}</span> : "—"}</td>
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
  const color = scoreColor(score);
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

type EmotionSummary = { dominant: string | null; distribution: Record<string, number> };

// Pull the per-answer emotion summary the backend attaches under emotion_data.summary.
// Returns null when no camera signal was captured, so callers can render "no signal".
function getEmotionSummary(ed?: Record<string, unknown> | null): EmotionSummary | null {
  const s = (ed as { summary?: Partial<EmotionSummary> } | null | undefined)?.summary;
  if (!s || !s.dominant) return null;
  return { dominant: s.dominant, distribution: s.distribution ?? {} };
}

// Dominant-emotion chip + a stacked distribution bar for a single answer.
function EmotionBar({ summary, label }: { summary: EmotionSummary | null; label?: ReactNode }) {
  if (!summary?.dominant) return null;
  const { dominant, distribution } = summary;
  const segments = Object.entries(distribution ?? {}).sort((a, b) => b[1] - a[1]);
  return (
    <div style={{ marginTop: 10 }}>
      {label && <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>{label}</div>}
      <span style={{ fontSize: 13, fontWeight: 600, color: EMOTION_COLORS[dominant] ?? "var(--text2)" }}>● {dominant}</span>
      {segments.length > 0 && (
        <div style={{ display: "flex", gap: 2, height: 6, marginTop: 6, borderRadius: 3, overflow: "hidden" }}>
          {segments.map(([emotion, pct]) => (
            <div key={emotion} title={`${emotion} ${pct}%`} style={{ width: `${pct}%`, background: EMOTION_COLORS[emotion] ?? "var(--text2)" }} />
          ))}
        </div>
      )}
    </div>
  );
}

// A labeled, icon-led section inside a question review card.
function ReviewBlock({ icon, label, color, boxed, children }: { icon: string; label: string; color: string; boxed?: boolean; children: ReactNode }) {
  return (
    <div style={{ marginTop: 10, ...(boxed ? { background: "var(--surf3)", borderLeft: `3px solid ${color}`, borderRadius: 6, padding: "8px 10px" } : {}) }}>
      <div style={{ fontSize: 11, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
        <Icon n={icon} s={12} c={color} />{label}
      </div>
      <div style={{ fontSize: 13.5, color: "var(--text2)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{children}</div>
    </div>
  );
}

// Full per-question review: question, the candidate's answer, feedback, strengths,
// improvements, the suggested model answer, and the captured emotion. Shared by the
// end-of-session Summary and the Session History detail so both stay consistent.
function QuestionReview({ q, index }: { q: InterviewQuestion; index: number }) {
  const [open, setOpen] = useState(false);
  const r = q.response;
  const score = r?.score;
  const color = scoreColor(score);
  const typeColor = Q_TYPE_COLORS[q.question_type] ?? "var(--text2)";
  const answer       = r?.response_text?.trim();
  const model        = r?.analysis?.model_answer?.trim();
  const strengths    = (r?.analysis?.strengths ?? []).filter(Boolean);
  const improvements = (r?.analysis?.improvements ?? []).filter(Boolean);
  return (
    <div style={{ background: "var(--surf2)", borderRadius: "var(--radius)", border: "1px solid var(--border)", marginBottom: 10, overflow: "hidden" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center", gap: 8, padding: 16, background: "none", border: "none", cursor: "pointer", textAlign: "left", color: "inherit", font: "inherit" }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
          <Icon n={open ? "chevD" : "chevR"} s={14} c="var(--text2)" />
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text2)", textTransform: "uppercase", flexShrink: 0 }}>Q{index + 1}</span>
          <PiqBadge label={q.question_type} style={{ background: `${typeColor}20`, color: typeColor, border: `1px solid ${typeColor}40`, textTransform: "capitalize", padding: "2px 8px", fontSize: 11, flexShrink: 0 }} />
          <span style={{ fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.question_text}</span>
        </span>
        {score != null && <span style={{ fontWeight: 700, color, flexShrink: 0 }}>{score}/100</span>}
      </button>

      {open && (
        <div style={{ padding: "0 16px 16px" }}>
          <p style={{ fontSize: 14, margin: 0, fontWeight: 500, lineHeight: 1.5, display: "flex", alignItems: "flex-start", gap: 6 }}>
            <Icon n="chat" s={14} c="var(--text2)" style={{ marginTop: 2 }} />
            {q.question_text}
          </p>

          <ReviewBlock icon="edit" label="Your Answer" color="var(--accent)" boxed>
            {answer || <span style={{ color: "var(--text3)", fontStyle: "italic" }}>No answer provided</span>}
          </ReviewBlock>

          {r?.feedback && <ReviewBlock icon="info" label="Feedback" color="var(--amber)">{r.feedback}</ReviewBlock>}

          {strengths.length > 0 && (
            <ReviewBlock icon="check" label="Strengths" color="var(--teal)">
              {strengths.map((s, i) => <div key={i}>• {s}</div>)}
            </ReviewBlock>
          )}

          {improvements.length > 0 && (
            <ReviewBlock icon="trend" label="Improvements" color="var(--rose)">
              {improvements.map((s, i) => <div key={i}>• {s}</div>)}
            </ReviewBlock>
          )}

          {model && <ReviewBlock icon="shield" label="Suggested Answer" color="var(--teal)" boxed>{model}</ReviewBlock>}

          <EmotionBar
            summary={getEmotionSummary(r?.emotion_data)}
            label={<><Icon n="activity" s={12} c="var(--text3)" />Emotion While Answering</>}
          />
        </div>
      )}
    </div>
  );
}
