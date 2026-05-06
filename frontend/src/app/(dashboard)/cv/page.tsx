"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { PiqBtn, PiqSpinner, PiqStatCard } from "@/components/piq/primitives";
import { PageHeader } from "@/components/common/PageHeader";
import { cvService } from "@/services/cv.service";
import type { CV, CVSection, CVJobMatch, CVSuggestion, CVAnalysisResult } from "@/types";
import { RadialBarChart, RadialBar, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PolarAngleAxis, ResponsiveContainer } from "recharts";
import { PiqChartContainer, PiqTooltip, PIQ_COLORS } from "@/components/piq/charts";

const STEPS = ["My CVs", "CV Editor", "Analysis", "Job Matches"] as const;
type Step = (typeof STEPS)[number];

const SECTION_TYPES = ["experience", "education", "skills", "projects", "summary"] as const;
type SectionType = (typeof SECTION_TYPES)[number];

type CVWithDetails = CV & { sections: CVSection[]; job_matches: CVJobMatch[]; suggestions: CVSuggestion[] };

export default function CVPage() {
  const [step, setStep]             = useState<Step>("My CVs");
  const [cvList, setCVList]         = useState<CV[]>([]);
  const [selected, setSelected]     = useState<CVWithDetails | null>(null);
  const [analysis, setAnalysis]     = useState<CVAnalysisResult | null>(null);
  const [loading, setLoading]       = useState(true);
  const [analysing, setAnalysing]   = useState(false);
  const [saving, setSaving]         = useState(false);
  const [activeSection, setActiveSection] = useState<SectionType>("experience");

  const [sections, setSections] = useState<Record<SectionType, string>>({
    experience: "", education: "", skills: "", projects: "", summary: "",
  });

  const [cvMeta, setCVMeta] = useState({ title: "My CV", github_url: "", linkedin_url: "", summary: "" });

  useEffect(() => {
    loadCVList();
  }, []);

  async function loadCVList() {
    setLoading(true);
    try {
      const res = await cvService.listCVs();
      setCVList(res.data.data ?? []);
    } catch {
      toast.error("Failed to load CVs");
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectCV(id: string) {
    setLoading(true);
    try {
      const res = await cvService.getCV(id);
      const cv = res.data.data;
      setSelected(cv);
      setCVMeta({ title: cv.title, github_url: cv.github_url ?? "", linkedin_url: cv.linkedin_url ?? "", summary: cv.summary ?? "" });
      const sectionMap: Record<SectionType, string> = { experience: "", education: "", skills: "", projects: "", summary: "" };
      for (const s of cv.sections ?? []) {
        if (SECTION_TYPES.includes(s.section_type as SectionType)) {
          sectionMap[s.section_type as SectionType] = (s.content as any)?.text ?? "";
        }
      }
      setSections(sectionMap);
      setStep("CV Editor");
    } catch {
      toast.error("Failed to load CV");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateCV() {
    try {
      const res = await cvService.createCV({ title: "New CV" });
      setCVList((prev) => [res.data.data, ...prev]);
      await handleSelectCV(res.data.data.id);
      toast.success("CV created");
    } catch {
      toast.error("Failed to create CV");
    }
  }

  async function handleSaveCV() {
    if (!selected) return;
    setSaving(true);
    try {
      await cvService.updateCV(selected.id, { title: cvMeta.title, github_url: cvMeta.github_url || undefined, linkedin_url: cvMeta.linkedin_url || undefined, summary: cvMeta.summary || undefined });
      const sectionRows = SECTION_TYPES.map((t, i) => ({ section_type: t, content: { text: sections[t] }, order_index: i }));
      await cvService.upsertSections(selected.id, sectionRows);
      toast.success("CV saved");
    } catch {
      toast.error("Failed to save CV");
    } finally {
      setSaving(false);
    }
  }

  async function handleAnalyse() {
    if (!selected) return;
    setAnalysing(true);
    try {
      const res = await cvService.analyzeCV(selected.id, { github_url: cvMeta.github_url || undefined });
      setAnalysis(res.data.data);
      await loadCVList();
      setStep("Analysis");
      toast.success("CV analysed successfully");
    } catch {
      toast.error("Failed to analyse CV");
    } finally {
      setAnalysing(false);
    }
  }

  async function handleDeleteCV(id: string) {
    try {
      await cvService.deleteCV(id);
      setCVList((prev) => prev.filter((c) => c.id !== id));
      if (selected?.id === id) { setSelected(null); setStep("My CVs"); }
      toast.success("CV deleted");
    } catch {
      toast.error("Failed to delete CV");
    }
  }

  const scoreColor = (s?: number) => !s ? "var(--text2)" : s >= 80 ? "var(--teal)" : s >= 60 ? "var(--amber)" : "var(--rose)";

  const bestATS = cvList.length > 0 ? Math.max(...cvList.map((c) => c.ats_score ?? 0)) : 0;
  const bestMatch = cvList.length > 0 ? Math.max(...cvList.map((c) => c.match_score ?? 0)) : 0;
  const analysedCount = cvList.filter((c) => c.ats_score != null).length;

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <PageHeader title="CV & Proficiency" description="Build, optimise, and analyse your CV against real job postings" />

      {!loading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 24 }}>
          <PiqStatCard label="CVs Created" value={cvList.length} icon="cv" color="var(--accent)" sub="Total CVs" />
          <PiqStatCard label="Best ATS Score" value={bestATS > 0 ? bestATS : "—"} icon="trend" color="var(--teal)" sub="Top score" />
          <PiqStatCard label="Best Job Match" value={bestMatch > 0 ? bestMatch : "—"} icon="career" color="var(--violet)" sub="Top match %" />
          <PiqStatCard label="Analysed CVs" value={analysedCount} icon="check" color="var(--amber)" sub="With feedback" />
        </div>
      )}

      <div style={{ display: "flex", gap: 4, marginBottom: 24, borderBottom: "1px solid var(--border)" }}>
        {STEPS.map((s) => (
          <button key={s} onClick={() => setStep(s)} disabled={s !== "My CVs" && !selected}
            style={{ padding: "8px 16px", fontSize: 14, border: "none", cursor: selected || s === "My CVs" ? "pointer" : "default", background: "transparent", fontWeight: step === s ? 600 : 400, color: step === s ? "var(--accent)" : (selected || s === "My CVs") ? "var(--text2)" : "var(--text3)", borderBottom: step === s ? "2px solid var(--accent)" : "2px solid transparent", marginBottom: -1 }}>{s}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}><PiqSpinner /></div>
      ) : (
        <>
          {/* Step 1: My CVs */}
          {step === "My CVs" && (
            <div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
                <PiqBtn icon="plus" onClick={handleCreateCV}>Create New CV</PiqBtn>
              </div>
              {cvList.length === 0 ? (
                <div style={{ textAlign: "center", padding: "48px 24px", color: "var(--text2)" }}>
                  <p style={{ fontSize: 14, margin: 0 }}>No CVs yet. Create your first CV to get started.</p>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px,1fr))", gap: 12 }}>
                  {cvList.map((cv) => (
                    <div key={cv.id} style={{ background: "var(--surf2)", borderRadius: "var(--radius)", padding: 18, border: "1px solid var(--border)" }}>
                      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>{cv.title}</div>
                      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                        {cv.ats_score != null && (
                          <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 20, background: `${scoreColor(cv.ats_score)}20`, color: scoreColor(cv.ats_score), border: `1px solid ${scoreColor(cv.ats_score)}40` }}>ATS {cv.ats_score}%</span>
                        )}
                        {cv.match_score != null && (
                          <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 20, background: `${scoreColor(cv.match_score)}20`, color: scoreColor(cv.match_score), border: `1px solid ${scoreColor(cv.match_score)}40` }}>Match {cv.match_score}%</span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 12 }}>{new Date(cv.created_at).toLocaleDateString()}</div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <PiqBtn size="sm" variant="secondary" onClick={() => handleSelectCV(cv.id)}>Edit</PiqBtn>
                        <PiqBtn size="sm" variant="outline" onClick={() => { handleSelectCV(cv.id).then(() => setStep("Analysis")); }}>Analyse</PiqBtn>
                        <button onClick={() => handleDeleteCV(cv.id)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--rose)", fontSize: 18 }}>×</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 2: CV Editor */}
          {step === "CV Editor" && selected && (
            <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 20 }}>
              {/* Left: section nav */}
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text2)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Sections</div>
                {SECTION_TYPES.map((t) => (
                  <button key={t} onClick={() => setActiveSection(t)} style={{ display: "block", width: "100%", padding: "8px 12px", textAlign: "left", borderRadius: "var(--radius)", border: "none", cursor: "pointer", background: activeSection === t ? "var(--accentD)" : "transparent", color: activeSection === t ? "var(--accent)" : "var(--text2)", fontSize: 14, marginBottom: 4, textTransform: "capitalize" }}>{t}</button>
                ))}
                <div style={{ marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
                  <div style={{ fontSize: 13, color: "var(--text2)", fontWeight: 600, marginBottom: 8 }}>Links</div>
                  <input value={cvMeta.github_url} onChange={(e) => setCVMeta({ ...cvMeta, github_url: e.target.value })} placeholder="GitHub URL" style={{ ...inputStyle, marginBottom: 6 }} />
                  <input value={cvMeta.linkedin_url} onChange={(e) => setCVMeta({ ...cvMeta, linkedin_url: e.target.value })} placeholder="LinkedIn URL" style={inputStyle} />
                </div>
              </div>

              {/* Right: content editor */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <input value={cvMeta.title} onChange={(e) => setCVMeta({ ...cvMeta, title: e.target.value })} style={{ ...inputStyle, fontSize: 18, fontWeight: 600, border: "none", background: "transparent", padding: "4px 0" }} />
                  <div style={{ display: "flex", gap: 8 }}>
                    <PiqBtn variant="secondary" size="sm" onClick={handleSaveCV} disabled={saving}>{saving ? "Saving…" : "Save"}</PiqBtn>
                    <PiqBtn size="sm" onClick={handleAnalyse} disabled={analysing}>{analysing ? "Analysing…" : "Analyse CV"}</PiqBtn>
                  </div>
                </div>
                <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 6, textTransform: "capitalize" }}>{activeSection}</div>
                <textarea
                  value={sections[activeSection]}
                  onChange={(e) => setSections({ ...sections, [activeSection]: e.target.value })}
                  rows={18}
                  placeholder={`Enter your ${activeSection} details here…`}
                  style={{ ...inputStyle, resize: "vertical", fontFamily: "var(--font-mono, monospace)", lineHeight: 1.6 }}
                />
              </div>
            </div>
          )}

          {/* Step 3: Analysis */}
          {step === "Analysis" && (
            <div>
              {analysing && <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: 48, gap: 12 }}><PiqSpinner /><p style={{ color: "var(--text2)", fontSize: 14 }}>Analysing your CV with Module C…</p></div>}

              {!analysing && !analysis && (
                <div style={{ textAlign: "center", padding: "48px 24px", color: "var(--text2)" }}>
                  <p style={{ fontSize: 14, margin: 0 }}>Go to CV Editor and click "Analyse CV" to run Module C analysis.</p>
                  <div style={{ marginTop: 16 }}><PiqBtn variant="secondary" onClick={() => setStep("CV Editor")}>← Back to Editor</PiqBtn></div>
                </div>
              )}

              {analysis && !analysing && (
                <div>
                  {/* Score gauges using Charts */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
                    <PiqChartContainer title="ATS Score" height={200}>
                      <ResponsiveContainer width="100%" height="100%">
                        <RadialBarChart
                          innerRadius="60%"
                          outerRadius="90%"
                          data={[{ name: "ATS Score", value: analysis.ats_score, fill: analysis.ats_score >= 80 ? PIQ_COLORS.teal : analysis.ats_score >= 60 ? PIQ_COLORS.amber : PIQ_COLORS.rose }]}
                          startAngle={220}
                          endAngle={-40}
                        >
                          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                          <RadialBar dataKey="value" cornerRadius={6} background={{ fill: "var(--surf2)" }} />
                        </RadialBarChart>
                      </ResponsiveContainer>
                      <div style={{ textAlign: "center", marginTop: -100, position: "relative", zIndex: 1, pointerEvents: "none" }}>
                        <div style={{ fontSize: 28, fontWeight: 700, color: analysis.ats_score >= 80 ? "var(--teal)" : analysis.ats_score >= 60 ? "var(--amber)" : "var(--rose)" }}>
                          {analysis.ats_score}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--text3)" }}>/ 100</div>
                      </div>
                    </PiqChartContainer>

                    <PiqChartContainer title="Job Match Scores" subtitle="Top matched positions" height={200}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={(analysis.job_matches ?? []).slice(0, 5).map((m) => ({
                            company: m.company.length > 10 ? m.company.slice(0, 10) + "…" : m.company,
                            match:   m.match_pct,
                          }))}
                          margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
                          barSize={22}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                          <XAxis dataKey="company" tick={{ fontSize: 11, fill: "var(--text3)" }} axisLine={false} tickLine={false} />
                          <YAxis unit="%" domain={[0, 100]} tick={{ fontSize: 11, fill: "var(--text3)" }} axisLine={false} tickLine={false} />
                          <Tooltip content={<PiqTooltip />} cursor={{ fill: "var(--surf2)" }} />
                          <Bar dataKey="match" name="Match %" radius={[4, 4, 0, 0]}
                            fill={PIQ_COLORS.violet} />
                        </BarChart>
                      </ResponsiveContainer>
                    </PiqChartContainer>
                  </div>

                  {/* Extracted Skills */}
                  <SectionLabel>Extracted Skills</SectionLabel>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
                    {(analysis.extracted_skills ?? []).map((s) => (
                      <div key={s.name} style={{ padding: "6px 12px", borderRadius: 20, background: "var(--surf2)", border: "1px solid var(--border)", fontSize: 13 }}>
                        <span style={{ fontWeight: 500 }}>{s.name}</span>
                        <span style={{ color: "var(--text2)", fontSize: 11, marginLeft: 6 }}>{s.proficiency_label}</span>
                        <span style={{ color: "var(--text3)", fontSize: 11, marginLeft: 4 }}>{Math.round(s.confidence * 100)}%</span>
                      </div>
                    ))}
                  </div>

                  {/* GitHub Verification */}
                  <SectionLabel>GitHub Verification</SectionLabel>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
                    {(analysis.github_verified ?? []).map((v) => (
                      <div key={v.skill} style={{ padding: "6px 12px", borderRadius: 20, border: `1px solid ${v.verified ? "var(--teal)" : "var(--border)"}`, background: v.verified ? "var(--tealD)" : "var(--surf2)", fontSize: 13, color: v.verified ? "var(--teal)" : "var(--text2)" }}>
                        {v.verified ? "✓" : "✗"} {v.skill} <span style={{ fontSize: 11 }}>{Math.round(v.confidence * 100)}%</span>
                      </div>
                    ))}
                  </div>

                  {/* Improvement Suggestions */}
                  <SectionLabel>Improvement Suggestions</SectionLabel>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
                    {(analysis.suggestions ?? []).map((s, i) => (
                      <div key={i} style={{ background: "var(--surf2)", borderRadius: "var(--radius)", padding: 14, border: "1px solid var(--border)" }}>
                        <div style={{ fontSize: 12, color: "var(--accent)", textTransform: "capitalize", marginBottom: 4 }}>{s.section}</div>
                        <div style={{ fontWeight: 500, marginBottom: 4 }}>{s.issue}</div>
                        <div style={{ fontSize: 13, color: "var(--text2)" }}>Fix: {s.fix_example}</div>
                      </div>
                    ))}
                  </div>

                  <PiqBtn variant="secondary" onClick={() => setStep("Job Matches")}>View Job Matches →</PiqBtn>
                </div>
              )}
            </div>
          )}

          {/* Step 4: Job Matches */}
          {step === "Job Matches" && (
            <div>
              {!analysis ? (
                <div style={{ textAlign: "center", padding: "48px 24px", color: "var(--text2)" }}>
                  <p style={{ fontSize: 14, margin: 0 }}>Run CV analysis first to see job matches.</p>
                  <div style={{ marginTop: 16 }}><PiqBtn variant="secondary" onClick={() => setStep("CV Editor")}>← Back to Editor</PiqBtn></div>
                </div>
              ) : (
                <div>
                  {(analysis.job_matches ?? []).map((m, i) => (
                    <div key={i} style={{ background: "var(--surf2)", borderRadius: "var(--radius)", padding: 18, border: "1px solid var(--border)", marginBottom: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 15 }}>{m.title}</div>
                          <div style={{ fontSize: 13, color: "var(--text2)", marginTop: 2 }}>{m.company}</div>
                        </div>
                        <span style={{ fontSize: 20, fontWeight: 700, color: scoreColor(m.match_pct) }}>{m.match_pct}%</span>
                      </div>
                      {(m.skill_gaps ?? []).length > 0 && (
                        <div style={{ marginTop: 10 }}>
                          <span style={{ fontSize: 12, color: "var(--text2)" }}>Missing: </span>
                          {m.skill_gaps.map((g) => (
                            <span key={g} style={{ fontSize: 12, background: "var(--roseD)", color: "var(--rose)", padding: "1px 8px", borderRadius: 10, marginRight: 4 }}>{g}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", borderRadius: "var(--radius)", border: "1px solid var(--border2)",
  background: "var(--surf3)", color: "var(--text)", fontSize: 14, boxSizing: "border-box",
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text2)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>{children}</div>;
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
