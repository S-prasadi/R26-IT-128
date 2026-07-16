"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { PiqBtn, PiqSpinner, PiqStatCard } from "@/components/piq/primitives";
import { PageHeader } from "@/components/common/PageHeader";
import { cvService } from "@/services/cv.service";
import type {
  CV, CVSection, CVJobMatch, CVSuggestion, CVAnalysisResult,
  CVSectionContent, CVExperienceEntry, CVEducationEntry, CVSkillsContent, CVProjectEntry,
  CVProjectVerification, CVJobPost,
} from "@/types";

const STEPS = ["My CVs", "CV Editor", "Analysis"] as const;
type Step = (typeof STEPS)[number];

const SECTION_TYPES = ["experience", "education", "skills", "projects", "summary"] as const;
type SectionType = (typeof SECTION_TYPES)[number];

type CVWithDetails = CV & { sections: CVSection[]; job_matches: CVJobMatch[]; suggestions: CVSuggestion[]; job_posts?: CVJobPost[] };

const EMPTY_SKILLS: CVSkillsContent = { languages: [], frameworks: [], tools: [], other: [] };
const EMPTY_STRUCTURED: CVSectionContent = {
  summary: "", experience: [], education: [], skills: { ...EMPTY_SKILLS }, projects: [],
};

export default function CVPage() {
  const [step, setStep]             = useState<Step>("My CVs");
  const [cvList, setCVList]         = useState<CV[]>([]);
  const [selected, setSelected]     = useState<CVWithDetails | null>(null);
  const [analysis, setAnalysis]     = useState<CVAnalysisResult | null>(null);
  const [loading, setLoading]       = useState(true);
  const [analysing, setAnalysing]   = useState(false);
  const [saving, setSaving]         = useState(false);
  const [activeSection, setActiveSection] = useState<SectionType>("experience");

  const [structuredSections, setStructuredSections] = useState<CVSectionContent>(EMPTY_STRUCTURED);
  const [cvMeta, setCVMeta] = useState({ title: "My CV", github_url: "", linkedin_url: "", summary: "" });
  const [uploading, setUploading] = useState(false);
  const [editorMode, setEditorMode] = useState<"edit" | "view">("edit");
  const [lastUploadedFile, setLastUploadedFile] = useState<File | null>(null);
  const [extractionPreview, setExtractionPreview] = useState<{
    show: boolean; warning: boolean;
    stats: { experience: number; education: number; skills: number; projects: number; hasSummary: boolean; github: string; linkedin: string; email: string; phone: string; portfolio: string };
  } | null>(null);

  const [projVerification, setProjVerification] = useState<CVProjectVerification | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [jobPosts, setJobPosts] = useState<CVJobPost[]>([]);
  const [jobTitle, setJobTitle] = useState("");
  const [jobText, setJobText] = useState("");
  const [comparing, setComparing] = useState(false);

  useEffect(() => { loadCVList(); }, []);

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

      const structured: CVSectionContent = { ...EMPTY_STRUCTURED, skills: { ...EMPTY_SKILLS } };
      for (const s of cv.sections ?? []) {
        const c = s.content as Record<string, unknown>;
        if (s.section_type === "summary")    structured.summary    = (c?.text as string) ?? (c?.summary as string) ?? "";
        if (s.section_type === "experience") structured.experience = (c?.entries as CVExperienceEntry[]) ?? [];
        if (s.section_type === "education")  structured.education  = (c?.entries as CVEducationEntry[])  ?? [];
        if (s.section_type === "skills")     structured.skills     = (c?.skills as CVSkillsContent)      ?? { ...EMPTY_SKILLS };
        if (s.section_type === "projects")   structured.projects   = (c?.entries as CVProjectEntry[])    ?? [];
      }
      setStructuredSections(structured);
      setEditorMode(cv.file_url ? "view" : "edit");
      setExtractionPreview(null);
      setProjVerification(cv.project_verification ?? null);
      setJobPosts(cv.job_posts ?? []);

      // Restore the stored analysis so revisiting a CV shows results
      // immediately without re-running Module C.
      const restoredAnalysis = {
        extracted_skills: (cv.bert_skills as CVAnalysisResult["extracted_skills"]) ?? [],
        github_verified:  (cv.github_verified_skills as CVAnalysisResult["github_verified"]) ?? [],
        job_matches: (cv.job_matches ?? []).map((m) => ({
          title:      m.job_title,
          company:    m.company ?? "",
          match_pct:  m.match_pct,
          skill_gaps: m.skill_gaps ?? [],
        })),
        suggestions: (cv.suggestions ?? []).map((s) => ({
          section:     s.section_type ?? "summary",
          issue:       s.issue,
          fix_example: s.fix_example ?? "",
        })),
      };
      setAnalysis(
        restoredAnalysis.extracted_skills.length ||
        restoredAnalysis.github_verified.length ||
        restoredAnalysis.job_matches.length ||
        restoredAnalysis.suggestions.length
          ? restoredAnalysis
          : null
      );

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
      toast.success("CV Added");
    } catch {
      toast.error("Failed to add CV");
    }
  }

  async function handleSaveCV() {
    if (!selected) return;
    setSaving(true);
    try {
      await cvService.updateCV(selected.id, {
        title: cvMeta.title,
        github_url: cvMeta.github_url || undefined,
        linkedin_url: cvMeta.linkedin_url || undefined,
        summary: cvMeta.summary || undefined,
      });
      const sectionRows = [
        { section_type: "summary"    as const, content: { text: structuredSections.summary },              order_index: 0 },
        { section_type: "experience" as const, content: { entries: structuredSections.experience },        order_index: 1 },
        { section_type: "education"  as const, content: { entries: structuredSections.education },         order_index: 2 },
        { section_type: "skills"     as const, content: { skills:  structuredSections.skills },            order_index: 3 },
        { section_type: "projects"   as const, content: { entries: structuredSections.projects },          order_index: 4 },
      ];
      await cvService.upsertSections(selected.id, sectionRows);
      toast.success("CV saved");
    } catch {
      toast.error("Failed to save CV");
    } finally {
      setSaving(false);
    }
  }

  async function doUpload(file: File) {
    if (!selected) return;
    setUploading(true);
    try {
      const res = await cvService.uploadCV(selected.id, file);
      const { file_url, sections: parsedSections, links } = res.data.data;
      setSelected((prev) => prev ? { ...prev, file_url } : prev);

      // Auto-fill links extracted from the CV
      if (links) {
        setCVMeta((prev) => ({
          ...prev,
          github_url:   links.github   || prev.github_url,
          linkedin_url: links.linkedin || prev.linkedin_url,
        }));
      }

      const filled: CVSectionContent = {
        summary:    typeof parsedSections?.summary    === "string"  ? parsedSections.summary    : "",
        experience: Array.isArray(parsedSections?.experience)       ? parsedSections.experience : [],
        education:  Array.isArray(parsedSections?.education)        ? parsedSections.education  : [],
        skills:     parsedSections?.skills ?? { ...EMPTY_SKILLS },
        projects:   Array.isArray(parsedSections?.projects)         ? parsedSections.projects   : [],
      };
      setStructuredSections(filled);

      const allSkillsCount = Object.values(filled.skills).flat().length;
      const stats = {
        experience: filled.experience.length,
        education:  filled.education.length,
        skills:     allSkillsCount,
        projects:   filled.projects.length,
        hasSummary: filled.summary.trim().length > 10,
        github:     links?.github   ?? "",
        linkedin:   links?.linkedin ?? "",
        email:      links?.email    ?? "",
        phone:      links?.phone    ?? "",
        portfolio:  links?.portfolio ?? "",
      };
      const isEmpty = stats.experience === 0 && stats.education === 0 && stats.skills === 0 && stats.projects === 0 && !stats.hasSummary;
      setExtractionPreview({ show: true, warning: isEmpty, stats });

      if (isEmpty) {
        toast.warning("Module D returned no structured content — fill sections manually");
      } else {
        toast.success("CV uploaded — sections auto-filled");
      }
      setEditorMode("view");
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleUploadCV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLastUploadedFile(file);
    await doUpload(file);
    e.target.value = "";
  }

  async function handleReExtract() {
    if (lastUploadedFile) await doUpload(lastUploadedFile);
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

  async function handleVerifyProjects() {
    if (!selected) return;
    setVerifying(true);
    try {
      const res = await cvService.verifyProjects(selected.id);
      setProjVerification(res.data.data);
      toast.success("Projects checked against your GitHub");
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Project verification failed");
    } finally {
      setVerifying(false);
    }
  }

  async function handleAttachJobPost(file?: File) {
    if (!selected) return;
    if (!file && jobText.trim().length < 30) {
      toast.error("Paste the job post text first (at least a few lines).");
      return;
    }
    setComparing(true);
    try {
      const res = await cvService.attachJobPost(
        selected.id,
        file ? { title: jobTitle || undefined, file } : { title: jobTitle || undefined, job_text: jobText }
      );
      setJobPosts((prev) => [res.data.data, ...prev]);
      setJobText("");
      setJobTitle("");
      toast.success("Job post compared against your CV");
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Job post comparison failed");
    } finally {
      setComparing(false);
    }
  }

  async function handleDeleteJobPost(jobPostId: string) {
    if (!selected) return;
    try {
      await cvService.deleteJobPost(selected.id, jobPostId);
      setJobPosts((prev) => prev.filter((p) => p.id !== jobPostId));
      toast.success("Job post removed");
    } catch {
      toast.error("Failed to remove job post");
    }
  }

  function handleApplySuggestion(s: { section: string; fix_example: string }) {
    const sec = s.section as SectionType;
    const fix = s.fix_example;
    if (sec === "experience" && structuredSections.experience.length > 0) {
      const updated = structuredSections.experience.map((e, i) =>
        i === 0 ? { ...e, bullets: [...e.bullets, fix] } : e
      );
      setStructuredSections((prev) => ({ ...prev, experience: updated }));
    } else if (sec === "summary") {
      setStructuredSections((prev) => ({ ...prev, summary: prev.summary ? `${prev.summary}\n\n${fix}` : fix }));
    } else if (sec === "skills") {
      setStructuredSections((prev) => ({
        ...prev, skills: { ...prev.skills, other: [...prev.skills.other, fix] },
      }));
    } else if (sec === "projects") {
      const newProj: CVProjectEntry = { name: "New Project", description: fix, tech_stack: [] };
      setStructuredSections((prev) => ({ ...prev, projects: [newProj, ...prev.projects] }));
    }
    setActiveSection(sec);
    setStep("CV Editor");
    setEditorMode("edit");
    toast.success(`Suggestion applied to ${sec} section`);
  }

  const scoreColor = (value?: number) => {
    if (value == null) return "var(--text2)";
    if (value >= 80) return "var(--teal)";
    if (value >= 60) return "var(--amber)";
    return "var(--rose)";
  };

  const sectionFilled = {
    experience: structuredSections.experience.length > 0,
    education:  structuredSections.education.length  > 0,
    skills:     Object.values(structuredSections.skills).flat().length > 0,
    projects:   structuredSections.projects.length > 0,
    summary:    structuredSections.summary.trim().length > 0,
  };

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <PageHeader title="CV & Proficiency" description="Build, optimise, and analyse your CV against real job postings" />

      {!loading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 14, marginBottom: 24 }}>
          <PiqStatCard label="CVs Created" value={cvList.length} icon="cv" color="var(--accent)" sub="Total CVs" />
          <PiqStatCard label="With Insights" value={cvList.filter((c) => c.match_score != null || c.bert_skills?.length || c.github_verified_skills?.length).length} icon="check" color="var(--amber)" sub="Ready for review" />
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
                <PiqBtn icon="plus" onClick={handleCreateCV}>Add New CV</PiqBtn>
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
                      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                        {cv.match_score != null && (
                          <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 20, background: "var(--accentD)", color: "var(--accent)", border: "1px solid var(--accentL)" }}>Match {cv.match_score}%</span>
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
            <div>
              {/* Top bar */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <input value={cvMeta.title} onChange={(e) => setCVMeta({ ...cvMeta, title: e.target.value })}
                  style={{ ...inputStyle, fontSize: 18, fontWeight: 600, border: "none", background: "transparent", padding: "4px 0", maxWidth: 300 }} />
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <label>
                    <PiqBtn variant="outline" size="sm" disabled={uploading} onClick={() => (document.getElementById("cv-file-input") as HTMLInputElement | null)?.click()}>
                      {uploading ? "Uploading…" : "Upload CV"}
                    </PiqBtn>
                    <input id="cv-file-input" type="file" accept=".pdf,.png,.jpg,.jpeg,.txt" style={{ display: "none" }} onChange={handleUploadCV} />
                  </label>
                  <PiqBtn variant="secondary" size="sm" onClick={handleSaveCV} disabled={saving}>{saving ? "Saving…" : "Save"}</PiqBtn>
                  <PiqBtn size="sm" onClick={handleAnalyse} disabled={analysing}>{analysing ? "Analysing…" : "Analyse CV"}</PiqBtn>
                </div>
              </div>

              {/* Extraction preview banner */}
              {extractionPreview?.show && (
                <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: "var(--radius)", border: `1px solid ${extractionPreview.warning ? "var(--amber)" : "var(--teal)"}`, background: extractionPreview.warning ? "var(--amberD, #451a03)15" : "var(--tealD, #042f2e)15", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ fontSize: 13 }}>
                    {extractionPreview.warning ? (
                      <>
                        <span style={{ color: "var(--amber)", fontWeight: 600 }}>No structured content detected.</span>
                        <span style={{ color: "var(--text2)", marginLeft: 6 }}>Module D may be unavailable — fill sections manually below.</span>
                      </>
                    ) : (
                      <>
                        <span style={{ color: "var(--teal)", fontWeight: 600 }}>Extracted: </span>
                        <span style={{ color: "var(--text2)" }}>
                          {extractionPreview.stats.experience > 0 && `${extractionPreview.stats.experience} experience ${extractionPreview.stats.experience === 1 ? "entry" : "entries"}`}
                          {extractionPreview.stats.education  > 0 && ` · ${extractionPreview.stats.education} education ${extractionPreview.stats.education === 1 ? "entry" : "entries"}`}
                          {extractionPreview.stats.skills     > 0 && ` · ${extractionPreview.stats.skills} skills`}
                          {extractionPreview.stats.projects   > 0 && ` · ${extractionPreview.stats.projects} project${extractionPreview.stats.projects === 1 ? "" : "s"}`}
                          {extractionPreview.stats.hasSummary  && " · summary"}
                        </span>
                        {(extractionPreview.stats.github || extractionPreview.stats.linkedin || extractionPreview.stats.email || extractionPreview.stats.phone || extractionPreview.stats.portfolio) && (
                          <div style={{ marginTop: 6, display: "flex", gap: 10, flexWrap: "wrap" }}>
                            {extractionPreview.stats.github    && <span style={{ fontSize: 12, color: "var(--teal)" }}>GitHub ✓</span>}
                            {extractionPreview.stats.linkedin  && <span style={{ fontSize: 12, color: "var(--teal)" }}>LinkedIn ✓</span>}
                            {extractionPreview.stats.portfolio && <span style={{ fontSize: 12, color: "var(--teal)" }}>Portfolio ✓</span>}
                            {extractionPreview.stats.email     && <span style={{ fontSize: 12, color: "var(--text2)" }}>{extractionPreview.stats.email}</span>}
                            {extractionPreview.stats.phone     && <span style={{ fontSize: 12, color: "var(--text2)" }}>{extractionPreview.stats.phone}</span>}
                          </div>
                        )}
                        <span style={{ color: "var(--text3)", fontSize: 12, marginTop: 4, display: "block" }}>Review each section and click Save.</span>
                      </>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    {extractionPreview.warning && lastUploadedFile && (
                      <PiqBtn size="sm" variant="outline" onClick={handleReExtract} disabled={uploading}>↺ Re-extract</PiqBtn>
                    )}
                    <button onClick={() => setExtractionPreview(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text3)", fontSize: 18, lineHeight: 1 }}>×</button>
                  </div>
                </div>
              )}

              {/* View toggle */}
              {selected.file_url && (
                <div style={{ display: "flex", gap: 0, marginBottom: 16, background: "var(--surf2)", borderRadius: "var(--radius)", border: "1px solid var(--border)", overflow: "hidden", width: "fit-content" }}>
                  <button onClick={() => setEditorMode("view")} style={{ padding: "6px 16px", fontSize: 13, border: "none", cursor: "pointer", background: editorMode === "view" ? "var(--accent)" : "transparent", color: editorMode === "view" ? "#fff" : "var(--text2)", fontWeight: editorMode === "view" ? 600 : 400 }}>View Uploaded CV</button>
                  <button onClick={() => setEditorMode("edit")} style={{ padding: "6px 16px", fontSize: 13, border: "none", cursor: "pointer", background: editorMode === "edit" ? "var(--accent)" : "transparent", color: editorMode === "edit" ? "#fff" : "var(--text2)", fontWeight: editorMode === "edit" ? 600 : 400 }}>Edit Sections</button>
                </div>
              )}

              {/* Uploaded CV viewer */}
              {editorMode === "view" && selected.file_url && (
                <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden", background: "var(--surf2)" }}>
                  <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 13, color: "var(--text2)" }}>Uploaded CV</span>
                    <div style={{ display: "flex", gap: 8 }}>
                      <a href={selected.file_url} target="_blank" rel="noopener noreferrer">
                        <PiqBtn size="sm" variant="outline">Open in new tab</PiqBtn>
                      </a>
                      <PiqBtn size="sm" variant="secondary" onClick={() => setEditorMode("edit")}>Edit sections →</PiqBtn>
                    </div>
                  </div>
                  {selected.file_url.match(/\.(png|jpg|jpeg)(\?|$)/i) ? (
                    <img src={selected.file_url} alt="Uploaded CV" style={{ width: "100%", display: "block" }} />
                  ) : (
                    <iframe src={selected.file_url} style={{ width: "100%", height: 700, border: "none", display: "block" }} title="Uploaded CV" />
                  )}
                </div>
              )}

              {/* Section editor */}
              {editorMode === "edit" && (
                <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 20 }}>
                  {/* Left: section nav with completeness dots */}
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text2)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Sections</div>
                    {SECTION_TYPES.map((t) => (
                      <button key={t} onClick={() => setActiveSection(t)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px", textAlign: "left", borderRadius: "var(--radius)", border: "none", cursor: "pointer", background: activeSection === t ? "var(--accentD)" : "transparent", color: activeSection === t ? "var(--accent)" : "var(--text2)", fontSize: 14, marginBottom: 4, textTransform: "capitalize" }}>
                        <span style={{ fontSize: 8, color: sectionFilled[t] ? "var(--teal)" : "var(--border2)" }}>●</span>
                        {t}
                      </button>
                    ))}
                    <div style={{ marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
                      <div style={{ fontSize: 13, color: "var(--text2)", fontWeight: 600, marginBottom: 8 }}>Links</div>
                      <input value={cvMeta.github_url}   onChange={(e) => setCVMeta({ ...cvMeta, github_url: e.target.value })}   placeholder="GitHub URL"   style={{ ...inputStyle, marginBottom: 6 }} />
                      <input value={cvMeta.linkedin_url} onChange={(e) => setCVMeta({ ...cvMeta, linkedin_url: e.target.value })} placeholder="LinkedIn URL" style={inputStyle} />
                    </div>
                  </div>

                  {/* Right: structured editor */}
                  <div>
                    <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 12, textTransform: "capitalize", fontWeight: 600 }}>{activeSection}</div>
                    {activeSection === "experience" && (
                      <ExperienceEditor
                        entries={structuredSections.experience}
                        onChange={(entries) => setStructuredSections((s) => ({ ...s, experience: entries }))}
                      />
                    )}
                    {activeSection === "education" && (
                      <EducationEditor
                        entries={structuredSections.education}
                        onChange={(entries) => setStructuredSections((s) => ({ ...s, education: entries }))}
                      />
                    )}
                    {activeSection === "skills" && (
                      <SkillsEditor
                        skills={structuredSections.skills}
                        onChange={(skills) => setStructuredSections((s) => ({ ...s, skills }))}
                      />
                    )}
                    {activeSection === "projects" && (
                      <ProjectsEditor
                        entries={structuredSections.projects}
                        onChange={(entries) => setStructuredSections((s) => ({ ...s, projects: entries }))}
                      />
                    )}
                    {activeSection === "summary" && (
                      <SummaryEditor
                        value={structuredSections.summary}
                        onChange={(v) => setStructuredSections((s) => ({ ...s, summary: v }))}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Analysis */}
          {step === "Analysis" && (
            <div>
              {analysing && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: 48, gap: 12 }}>
                  <PiqSpinner />
                  <p style={{ color: "var(--text2)", fontSize: 14 }}>Analysing your CV with Module C…</p>
                </div>
              )}

              {!analysing && !analysis && (
                <div style={{ textAlign: "center", padding: "24px", color: "var(--text2)", marginBottom: 16 }}>
                  <p style={{ fontSize: 14, margin: 0 }}>Go to CV Editor and click "Analyse CV" to run Module C analysis.</p>
                  <div style={{ marginTop: 16 }}><PiqBtn variant="secondary" onClick={() => setStep("CV Editor")}>← Back to Editor</PiqBtn></div>
                </div>
              )}

              {analysis && !analysing && (
                <div>
                  {/* Saved results header + re-analyse */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, color: "var(--text2)" }}>
                      Saved analysis{selected?.updated_at ? ` — last updated ${new Date(selected.updated_at).toLocaleString()}` : ""}. Re-analyse after editing to refresh the stored results.
                    </span>
                    <PiqBtn size="sm" variant="secondary" onClick={handleAnalyse} disabled={analysing}>↻ Re-analyse CV</PiqBtn>
                  </div>

                  {/* Insights */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px,1fr))", gap: 16, marginBottom: 24 }}>
                    {analysis.job_matches?.length > 0 && (() => {
                      const top = analysis.job_matches.slice(0, 3);
                      const avg = Math.round(top.reduce((s, m) => s + m.match_pct, 0) / top.length);
                      return (
                        <div style={{ background: "var(--surf2)", borderRadius: "var(--radius)", border: "1px solid var(--border)", padding: 16, minHeight: 200, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
                          <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 8 }}>Average Match Score</div>
                          <div style={{ fontSize: 40, fontWeight: 700, color: avg >= 80 ? "var(--teal)" : avg >= 60 ? "var(--amber)" : "var(--rose)" }}>{avg}</div>
                          <div style={{ fontSize: 12, color: "var(--text3)" }}>/ 100</div>
                          <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 8 }}>Across the top matching roles</div>
                        </div>
                      );
                    })()}
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

                  {/* Job Matches */}
                  <SectionLabel>Job Matches</SectionLabel>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
                    {(analysis.job_matches ?? []).length === 0 ? (
                      <div style={{ fontSize: 14, color: "var(--text3)", padding: "8px 0" }}>No job matches found.</div>
                    ) : (analysis.job_matches ?? []).map((m, i) => (
                      <div key={i} style={{ background: "var(--surf2)", borderRadius: "var(--radius)", padding: 14, border: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: 15 }}>{m.title}</div>
                          {m.company && <div style={{ fontSize: 13, color: "var(--text2)", marginTop: 2 }}>{m.company}</div>}
                          {m.skill_gaps && m.skill_gaps.length > 0 && (
                            <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                              {m.skill_gaps.map((g) => (
                                <span key={g} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "var(--roseD, #4c0519)20", color: "var(--rose)", border: "1px solid var(--rose)40" }}>Gap: {g}</span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontSize: 24, fontWeight: 700, color: scoreColor(m.match_pct) }}>{m.match_pct}%</div>
                          <div style={{ fontSize: 12, color: "var(--text3)" }}>match</div>
                        </div>
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
                      <div key={i} style={{ background: "var(--surf2)", borderRadius: "var(--radius)", padding: 14, border: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, color: "var(--accent)", textTransform: "capitalize", marginBottom: 4 }}>{s.section}</div>
                          <div style={{ fontWeight: 500, marginBottom: 4 }}>{s.issue}</div>
                          <div style={{ fontSize: 13, color: "var(--text2)" }}>Fix: {s.fix_example}</div>
                        </div>
                        <PiqBtn size="sm" variant="outline" onClick={() => handleApplySuggestion(s)}>Apply →</PiqBtn>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selected && !analysing && (
                <>
                  {/* GitHub project validation */}
                  <SectionLabel>GitHub Project Validation</SectionLabel>
                  <div style={{ ...cardStyle, marginBottom: 24 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      <div style={{ fontSize: 13, color: "var(--text2)" }}>
                        Cross-checks the projects on this CV against your connected GitHub account — repo exists, belongs to you, and actually uses the claimed tech.
                      </div>
                      <PiqBtn size="sm" onClick={handleVerifyProjects} disabled={verifying}>
                        {verifying ? "Checking…" : projVerification ? "Re-check Projects" : "Verify GitHub Projects"}
                      </PiqBtn>
                    </div>
                    {projVerification && (
                      <div style={{ marginTop: 14 }}>
                        <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 10 }}>
                          @{projVerification.github_username} · {projVerification.summary.verified}/{projVerification.summary.total} verified · checked {new Date(projVerification.checked_at).toLocaleDateString()}
                        </div>
                        {projVerification.results.map((r, i) => (
                          <div key={i} style={{ borderTop: "1px solid var(--border2)", padding: "10px 0", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                            <div style={{ flex: 1, minWidth: 220 }}>
                              <div style={{ fontWeight: 600, fontSize: 14 }}>
                                {r.found && r.owned_by_user ? "✓" : "✗"} {r.name}
                                {r.is_fork && <span style={{ fontSize: 11, color: "var(--amber)", marginLeft: 6 }}>(fork)</span>}
                              </div>
                              <div style={{ fontSize: 12, color: r.found && r.owned_by_user ? "var(--teal)" : "var(--rose)", marginTop: 2 }}>
                                {!r.found ? "No matching repo found on your GitHub"
                                  : !r.owned_by_user ? "Linked repo is not owned by your connected account"
                                  : <>Verified — <a href={r.repo_url ?? "#"} target="_blank" rel="noreferrer" style={{ color: "var(--teal)" }}>{r.repo_url?.replace("https://github.com/", "")}</a>{r.last_pushed ? ` · last active ${new Date(r.last_pushed).toLocaleDateString()}` : ""}</>}
                              </div>
                              {(r.languages_matched.length > 0 || r.languages_unverified.length > 0) && (
                                <div style={{ marginTop: 6, display: "flex", gap: 5, flexWrap: "wrap" }}>
                                  {r.languages_matched.map((t) => (
                                    <span key={t} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "var(--tealD)", color: "var(--teal)" }}>✓ {t}</span>
                                  ))}
                                  {r.languages_unverified.map((t) => (
                                    <span key={t} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "var(--surf3)", color: "var(--text3)" }} title="Not found in the repo's languages or topics">? {t}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                            {r.found && (
                              <div style={{ textAlign: "right", flexShrink: 0 }}>
                                <div style={{ fontSize: 18, fontWeight: 700, color: r.confidence >= 0.7 ? "var(--teal)" : "var(--amber)" }}>{Math.round(r.confidence * 100)}%</div>
                                <div style={{ fontSize: 11, color: "var(--text3)" }}>confidence</div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Job post comparison */}
                  <SectionLabel>Compare With a Real Job Post</SectionLabel>
                  <div style={{ ...cardStyle, marginBottom: 16 }}>
                    <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 10 }}>
                      Paste a job advertisement (or upload it as a PDF/image) to see how this CV matches it — skill gaps with market demand, readiness score, and AI tailoring tips.
                    </div>
                    <input
                      value={jobTitle}
                      onChange={(e) => setJobTitle(e.target.value)}
                      placeholder="Job title (optional) — e.g. Associate Software Engineer at WSO2"
                      style={{ ...inputStyle, marginBottom: 8 }}
                    />
                    <textarea
                      value={jobText}
                      onChange={(e) => setJobText(e.target.value)}
                      rows={5}
                      placeholder="Paste the full job post text here…"
                      style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5, marginBottom: 10 }}
                    />
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <PiqBtn size="sm" onClick={() => handleAttachJobPost()} disabled={comparing}>
                        {comparing ? "Comparing…" : "Compare With CV"}
                      </PiqBtn>
                      <label style={{ fontSize: 13, color: "var(--accent)", cursor: "pointer" }}>
                        📎 or upload job post file
                        <input type="file" accept=".pdf,.png,.jpg,.jpeg,.txt" style={{ display: "none" }}
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAttachJobPost(f); e.target.value = ""; }} />
                      </label>
                    </div>
                  </div>

                  {jobPosts.map((post) => (
                    <JobPostResult key={post.id} post={post} onApply={handleApplySuggestion} onDelete={() => handleDeleteJobPost(post.id)} />
                  ))}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Shared styles ──────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", borderRadius: "var(--radius)", border: "1px solid var(--border2)",
  background: "var(--surf3)", color: "var(--text)", fontSize: 14, boxSizing: "border-box",
};

const cardStyle: React.CSSProperties = {
  background: "var(--surf2)", borderRadius: "var(--radius)", padding: 16,
  border: "1px solid var(--border)", marginBottom: 12,
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text2)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>{children}</div>;
}

const VELOCITY_BADGE: Record<string, { icon: string; color: string }> = {
  rising:  { icon: "▲", color: "var(--teal)" },
  stable:  { icon: "→", color: "var(--text2)" },
  falling: { icon: "▼", color: "var(--rose)" },
};

function JobPostResult({ post, onApply, onDelete }: {
  post: CVJobPost;
  onApply: (s: { section: string; fix_example: string }) => void;
  onDelete: () => void;
}) {
  const c = post.comparison ?? ({} as CVJobPost["comparison"]);
  const t = post.tailoring ?? ({} as CVJobPost["tailoring"]);
  const matchColor = c.match_pct >= 80 ? "var(--teal)" : c.match_pct >= 60 ? "var(--amber)" : "var(--rose)";
  const gaps: Array<{ skill: string; predicted_weekly_demand?: number; velocity?: string }> =
    c.missing_with_demand ?? (c.missing_skills ?? []).map((skill) => ({ skill }));

  return (
    <div style={{ ...cardStyle, marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{post.title || c.closest_role || "Job post"}</div>
          <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>
            Compared {new Date(post.created_at).toLocaleString()}
            {c.closest_role && <> · closest role blueprint: {c.closest_role}</>}
            {c.predicted_level && <> · readiness: {c.predicted_level}{c.predicted_score != null ? ` (${Math.round(c.predicted_score)})` : ""}</>}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: matchColor }}>{c.match_pct ?? 0}%</div>
            <div style={{ fontSize: 11, color: "var(--text3)" }}>skill match</div>
          </div>
          <button onClick={onDelete} title="Remove this job post" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text3)", fontSize: 18 }}>×</button>
        </div>
      </div>

      {c.unavailable && (
        <div style={{ marginTop: 10, fontSize: 13, color: "var(--amber)" }}>Module C was unavailable for this comparison — re-attach the job post once it is running.</div>
      )}

      {(c.matched_skills?.length > 0 || gaps.length > 0) && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {(c.matched_skills ?? []).map((s) => (
              <span key={s} style={{ fontSize: 12, padding: "3px 10px", borderRadius: 20, background: "var(--tealD)", color: "var(--teal)" }}>✓ {s}</span>
            ))}
            {gaps.map((g) => {
              const v = g.velocity ? VELOCITY_BADGE[g.velocity] : null;
              return (
                <span key={g.skill} style={{ fontSize: 12, padding: "3px 10px", borderRadius: 20, background: "var(--surf3)", color: "var(--rose)", border: "1px solid var(--rose)40" }}
                  title={g.predicted_weekly_demand != null ? `Market demand: ~${g.predicted_weekly_demand} job ads/week (${g.velocity})` : "Missing from your CV"}>
                  ✗ {g.skill}
                  {v && <span style={{ color: v.color, marginLeft: 5 }}>{v.icon} {g.velocity}</span>}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {(c.recommendations ?? []).length > 0 && (
        <ul style={{ margin: "12px 0 0", paddingLeft: 18, fontSize: 13, color: "var(--text2)", lineHeight: 1.7 }}>
          {c.recommendations.map((r, i) => <li key={i}>{r}</li>)}
        </ul>
      )}

      {t.tailored_summary && (
        <div style={{ marginTop: 14, background: "var(--surf3)", borderRadius: "var(--radius)", padding: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)", marginBottom: 4 }}>AI-tailored summary for this job</div>
          <div style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.6 }}>{t.tailored_summary}</div>
          <div style={{ marginTop: 8 }}>
            <PiqBtn size="sm" variant="outline" onClick={() => onApply({ section: "summary", fix_example: t.tailored_summary })}>Apply to Summary →</PiqBtn>
          </div>
        </div>
      )}

      {(t.suggestions ?? []).length > 0 && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {t.suggestions.map((s, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", borderTop: "1px solid var(--border2)", paddingTop: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: "var(--accent)", textTransform: "capitalize" }}>{s.section}</div>
                <div style={{ fontSize: 13, fontWeight: 500, margin: "2px 0" }}>{s.issue}</div>
                {s.fix_example && <div style={{ fontSize: 13, color: "var(--text2)" }}>Fix: {s.fix_example}</div>}
              </div>
              {s.fix_example && <PiqBtn size="sm" variant="outline" onClick={() => onApply(s)}>Apply →</PiqBtn>}
            </div>
          ))}
        </div>
      )}

      {(t.keywords_to_add ?? []).length > 0 && (
        <div style={{ marginTop: 12 }}>
          <span style={{ fontSize: 12, color: "var(--text3)", marginRight: 8 }}>ATS keywords to add:</span>
          {t.keywords_to_add.map((k) => (
            <span key={k} style={{ fontSize: 12, padding: "2px 8px", borderRadius: 20, background: "var(--surf3)", color: "var(--text2)", marginRight: 5 }}>{k}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Structured section editors ─────────────────────────────────────────────────

function ExperienceEditor({ entries, onChange }: { entries: CVExperienceEntry[]; onChange: (e: CVExperienceEntry[]) => void }) {
  function update(i: number, patch: Partial<CVExperienceEntry>) {
    onChange(entries.map((e, idx) => idx === i ? { ...e, ...patch } : e));
  }
  function addEntry() {
    onChange([...entries, { company: "", role: "", start_date: "", end_date: "", location: "", bullets: [] }]);
  }
  function removeEntry(i: number) { onChange(entries.filter((_, idx) => idx !== i)); }
  function addBullet(i: number)   { update(i, { bullets: [...entries[i].bullets, ""] }); }
  function updateBullet(i: number, bi: number, val: string) {
    const bullets = entries[i].bullets.map((b, bi2) => bi2 === bi ? val : b);
    update(i, { bullets });
  }
  function removeBullet(i: number, bi: number) {
    update(i, { bullets: entries[i].bullets.filter((_, bi2) => bi2 !== bi) });
  }

  return (
    <div>
      {entries.map((e, i) => (
        <div key={i} style={cardStyle}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            <input value={e.company}    onChange={(ev) => update(i, { company:    ev.target.value })} placeholder="Company"    style={inputStyle} />
            <input value={e.role}       onChange={(ev) => update(i, { role:       ev.target.value })} placeholder="Role / Title" style={inputStyle} />
            <input value={e.start_date} onChange={(ev) => update(i, { start_date: ev.target.value })} placeholder="Start date (e.g. Jan 2022)" style={inputStyle} />
            <input value={e.end_date}   onChange={(ev) => update(i, { end_date:   ev.target.value })} placeholder="End date (or Present)" style={inputStyle} />
            <input value={e.location ?? ""} onChange={(ev) => update(i, { location: ev.target.value })} placeholder="Location (optional)" style={{ ...inputStyle, gridColumn: "1 / -1" }} />
          </div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 6 }}>Bullet points</div>
            {e.bullets.map((b, bi) => (
              <div key={bi} style={{ display: "flex", gap: 6, marginBottom: 4 }}>
                <input value={b} onChange={(ev) => updateBullet(i, bi, ev.target.value)} placeholder={`Bullet ${bi + 1}`} style={{ ...inputStyle, flex: 1 }} />
                <button onClick={() => removeBullet(i, bi)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--rose)", fontSize: 16, padding: "0 4px" }}>×</button>
              </div>
            ))}
            <button onClick={() => addBullet(i)} style={{ fontSize: 12, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", padding: 0, marginTop: 2 }}>+ Add bullet</button>
          </div>
          <button onClick={() => removeEntry(i)} style={{ fontSize: 12, color: "var(--rose)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Remove entry</button>
        </div>
      ))}
      <PiqBtn variant="outline" size="sm" onClick={addEntry}>+ Add experience</PiqBtn>
    </div>
  );
}

function EducationEditor({ entries, onChange }: { entries: CVEducationEntry[]; onChange: (e: CVEducationEntry[]) => void }) {
  function update(i: number, patch: Partial<CVEducationEntry>) {
    onChange(entries.map((e, idx) => idx === i ? { ...e, ...patch } : e));
  }
  function addEntry() {
    onChange([...entries, { institution: "", degree: "", field: "", start_date: "", end_date: "", grade: "" }]);
  }
  function removeEntry(i: number) { onChange(entries.filter((_, idx) => idx !== i)); }

  return (
    <div>
      {entries.map((e, i) => (
        <div key={i} style={cardStyle}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            <input value={e.institution}  onChange={(ev) => update(i, { institution:  ev.target.value })} placeholder="Institution"          style={{ ...inputStyle, gridColumn: "1 / -1" }} />
            <input value={e.degree}       onChange={(ev) => update(i, { degree:       ev.target.value })} placeholder="Degree (e.g. BSc)"     style={inputStyle} />
            <input value={e.field ?? ""}  onChange={(ev) => update(i, { field:        ev.target.value })} placeholder="Field of study"        style={inputStyle} />
            <input value={e.start_date}   onChange={(ev) => update(i, { start_date:   ev.target.value })} placeholder="Start date"            style={inputStyle} />
            <input value={e.end_date}     onChange={(ev) => update(i, { end_date:     ev.target.value })} placeholder="End date"               style={inputStyle} />
            <input value={e.grade ?? ""}  onChange={(ev) => update(i, { grade:        ev.target.value })} placeholder="Grade / GPA (optional)" style={{ ...inputStyle, gridColumn: "1 / -1" }} />
          </div>
          <button onClick={() => removeEntry(i)} style={{ fontSize: 12, color: "var(--rose)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Remove entry</button>
        </div>
      ))}
      <PiqBtn variant="outline" size="sm" onClick={addEntry}>+ Add education</PiqBtn>
    </div>
  );
}

function SkillsEditor({ skills, onChange }: { skills: CVSkillsContent; onChange: (s: CVSkillsContent) => void }) {
  const [inputs, setInputs] = useState<Record<keyof CVSkillsContent, string>>({
    languages: "", frameworks: "", tools: "", other: "",
  });
  const categories: Array<{ key: keyof CVSkillsContent; label: string }> = [
    { key: "languages",  label: "Languages"  },
    { key: "frameworks", label: "Frameworks & Libraries" },
    { key: "tools",      label: "Tools & Platforms" },
    { key: "other",      label: "Other" },
  ];

  function addSkill(cat: keyof CVSkillsContent) {
    const val = inputs[cat].trim();
    if (!val) return;
    onChange({ ...skills, [cat]: [...skills[cat], val] });
    setInputs((p) => ({ ...p, [cat]: "" }));
  }
  function removeSkill(cat: keyof CVSkillsContent, idx: number) {
    onChange({ ...skills, [cat]: skills[cat].filter((_, i) => i !== idx) });
  }

  return (
    <div>
      {categories.map(({ key, label }) => (
        <div key={key} style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text2)", marginBottom: 8 }}>{label}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            {skills[key].map((sk, i) => (
              <span key={i} style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 20, background: "var(--accentD)", color: "var(--accent)", border: "1px solid var(--accent)40", fontSize: 13 }}>
                {sk}
                <button onClick={() => removeSkill(key, i)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text3)", fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              value={inputs[key]}
              onChange={(e) => setInputs((p) => ({ ...p, [key]: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSkill(key); } }}
              placeholder={`Add ${label.toLowerCase()} (press Enter)`}
              style={{ ...inputStyle, flex: 1 }}
            />
            <PiqBtn size="sm" variant="secondary" onClick={() => addSkill(key)}>Add</PiqBtn>
          </div>
        </div>
      ))}
    </div>
  );
}

function ProjectsEditor({ entries, onChange }: { entries: CVProjectEntry[]; onChange: (e: CVProjectEntry[]) => void }) {
  const [techInputs, setTechInputs] = useState<Record<number, string>>({});

  function update(i: number, patch: Partial<CVProjectEntry>) {
    onChange(entries.map((e, idx) => idx === i ? { ...e, ...patch } : e));
  }
  function addEntry() {
    onChange([...entries, { name: "", description: "", tech_stack: [], url: "", start_date: "", end_date: "" }]);
  }
  function removeEntry(i: number) { onChange(entries.filter((_, idx) => idx !== i)); }
  function addTech(i: number) {
    const val = (techInputs[i] ?? "").trim();
    if (!val) return;
    update(i, { tech_stack: [...entries[i].tech_stack, val] });
    setTechInputs((p) => ({ ...p, [i]: "" }));
  }
  function removeTech(i: number, ti: number) {
    update(i, { tech_stack: entries[i].tech_stack.filter((_, idx) => idx !== ti) });
  }

  return (
    <div>
      {entries.map((e, i) => (
        <div key={i} style={cardStyle}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            <input value={e.name}        onChange={(ev) => update(i, { name:        ev.target.value })} placeholder="Project name"      style={{ ...inputStyle, gridColumn: "1 / -1" }} />
            <input value={e.url ?? ""}   onChange={(ev) => update(i, { url:         ev.target.value })} placeholder="URL (optional)"    style={{ ...inputStyle, gridColumn: "1 / -1" }} />
            <input value={e.start_date ?? ""} onChange={(ev) => update(i, { start_date: ev.target.value })} placeholder="Start date"   style={inputStyle} />
            <input value={e.end_date   ?? ""} onChange={(ev) => update(i, { end_date:   ev.target.value })} placeholder="End date"     style={inputStyle} />
          </div>
          <textarea
            value={e.description}
            onChange={(ev) => update(i, { description: ev.target.value })}
            rows={3}
            placeholder="Description"
            style={{ ...inputStyle, resize: "vertical", marginBottom: 8 }}
          />
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 6 }}>Tech stack</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
              {e.tech_stack.map((t, ti) => (
                <span key={ti} style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 20, background: "var(--surf3)", border: "1px solid var(--border2)", fontSize: 12 }}>
                  {t}
                  <button onClick={() => removeTech(i, ti)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text3)", fontSize: 13, lineHeight: 1, padding: 0 }}>×</button>
                </span>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                value={techInputs[i] ?? ""}
                onChange={(ev) => setTechInputs((p) => ({ ...p, [i]: ev.target.value }))}
                onKeyDown={(ev) => { if (ev.key === "Enter") { ev.preventDefault(); addTech(i); } }}
                placeholder="Add technology (Enter)"
                style={{ ...inputStyle, flex: 1 }}
              />
              <PiqBtn size="sm" variant="secondary" onClick={() => addTech(i)}>Add</PiqBtn>
            </div>
          </div>
          <button onClick={() => removeEntry(i)} style={{ fontSize: 12, color: "var(--rose)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Remove project</button>
        </div>
      ))}
      <PiqBtn variant="outline" size="sm" onClick={addEntry}>+ Add project</PiqBtn>
    </div>
  );
}

function SummaryEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={10}
        placeholder="Write a professional summary highlighting your key skills and goals…"
        style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }}
      />
      <div style={{ fontSize: 12, color: value.length > 500 ? "var(--amber)" : "var(--text3)", marginTop: 6, textAlign: "right" }}>
        {value.length} / 500 recommended
      </div>
    </div>
  );
}
