import { supabaseAdmin } from "../config/supabase";
import { AppError } from "../middlewares/error.middleware";
import { HTTP_STATUS } from "../constants/http";
import { callPython, pythonUrls } from "./python.service";
import { notificationService } from "./notification.service";
import { progressService } from "./progress.service";
import { githubService } from "./github.service";
import type {
  CreateCVDto,
  UpdateCVDto,
  UpsertSectionsDto,
  AnalyzeCVDto,
} from "../validations/cv.validation";

const MOCK_CV_ANALYSIS = {
  extracted_skills: [
    { name: "React",      proficiency_label: "Advanced",      confidence: 0.92 },
    { name: "TypeScript", proficiency_label: "Intermediate",  confidence: 0.85 },
    { name: "Node.js",    proficiency_label: "Intermediate",  confidence: 0.80 },
    { name: "Python",     proficiency_label: "Beginner",      confidence: 0.70 },
    { name: "PostgreSQL", proficiency_label: "Beginner",      confidence: 0.65 },
  ],
  github_verified: [
    { skill: "React",      verified: true,  confidence: 0.91, evidence_url: null },
    { skill: "TypeScript", verified: true,  confidence: 0.87, evidence_url: null },
    { skill: "Node.js",    verified: false, confidence: 0.40, evidence_url: null },
  ],
  ats_score: 74,
  job_matches: [
    { title: "Frontend Developer",     company: "99x Technology",  match_pct: 88, skill_gaps: ["Redux","Jest"] },
    { title: "Full-Stack Engineer",    company: "WSO2",            match_pct: 76, skill_gaps: ["Java","Kubernetes"] },
    { title: "React Developer",        company: "IFS",             match_pct: 82, skill_gaps: ["Docker"] },
  ],
  suggestions: [
    { section: "skills",     issue: "Missing quantified metrics",       fix_example: "Add: 'Improved page load by 40% using React lazy loading'" },
    { section: "experience", issue: "Action verbs are weak",            fix_example: "Replace 'worked on' with 'engineered', 'delivered', 'optimised'" },
    { section: "summary",    issue: "Summary too generic",              fix_example: "Mention specific technologies and measurable outcomes" },
  ],
};

const MOCK_JOB_COMPARISON = {
  match_pct: 0,
  matched_skills: [] as string[],
  missing_skills: [] as string[],
  job_skills: [] as string[],
  closest_role: null as string | null,
  predicted_score: null as number | null,
  predicted_level: null as string | null,
  recommendations: ["Module C is unavailable — start it to compare this CV against the job post."],
  unavailable: true,
};

const MOCK_TAILORING = {
  tailored_summary: "",
  suggestions: [] as Array<{ section: string; issue: string; fix_example: string }>,
  keywords_to_add: [] as string[],
};

// Framework/library → GitHub linguist language, so a project claiming "React"
// is verified by a repo whose language breakdown contains JavaScript/TypeScript.
const TECH_TO_LANGS: Record<string, string[]> = {
  react: ["javascript", "typescript"], nextjs: ["javascript", "typescript"],
  nodejs: ["javascript", "typescript"], node: ["javascript", "typescript"],
  express: ["javascript", "typescript"], vue: ["javascript", "typescript"],
  angular: ["typescript", "javascript"], reactnative: ["javascript", "typescript"],
  django: ["python"], flask: ["python"], fastapi: ["python"],
  springboot: ["java"], spring: ["java"], rails: ["ruby"], laravel: ["php"],
  flutter: ["dart"], dotnet: ["c#"], tailwind: ["css"], bootstrap: ["css"],
};

const normTech = (s: string) => (s ?? "").toLowerCase().replace(/[^a-z0-9#]/g, "");

export const cvService = {
  async listCVs(userId: string) {
    const { data, error } = await supabaseAdmin
      .from("cvs")
      .select("id, title, ats_score, match_score, github_url, linkedin_url, created_at, updated_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new AppError(error.message, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    return data ?? [];
  },

  async getCV(cvId: string, userId: string) {
    const { data: cv, error } = await supabaseAdmin
      .from("cvs")
      .select("*")
      .eq("id", cvId)
      .eq("user_id", userId)
      .single();
    if (error || !cv) throw new AppError("CV not found", HTTP_STATUS.NOT_FOUND);

    const [{ data: sections }, { data: matches }, { data: suggestions }, { data: jobPosts }] = await Promise.all([
      supabaseAdmin.from("cv_sections").select("*").eq("cv_id", cvId).order("order_index"),
      supabaseAdmin.from("cv_job_matches").select("*").eq("cv_id", cvId).order("match_pct", { ascending: false }),
      supabaseAdmin.from("cv_suggestions").select("*").eq("cv_id", cvId).order("priority"),
      supabaseAdmin.from("cv_job_posts").select("id, title, comparison, tailoring, created_at").eq("cv_id", cvId).order("created_at", { ascending: false }),
    ]);

    // Always generate a fresh signed URL from the permanent file_path
    let file_url: string | null = null;
    const storedPath = cv.file_path ?? (cv.file_url && !cv.file_url.startsWith("http") ? cv.file_url : null);
    if (storedPath) {
      const { data: signedData } = await supabaseAdmin.storage
        .from("cv-files")
        .createSignedUrl(storedPath, 3600);
      file_url = signedData?.signedUrl ?? null;
    }

    return {
      ...cv,
      file_url,
      sections:    sections    ?? [],
      job_matches: matches     ?? [],
      suggestions: suggestions ?? [],
      job_posts:   jobPosts    ?? [],
    };
  },

  async createCV(userId: string, dto: CreateCVDto) {
    const { data, error } = await supabaseAdmin
      .from("cvs")
      .insert({ user_id: userId, ...dto })
      .select("id, title, ats_score, match_score, github_url, linkedin_url, created_at")
      .single();
    if (error) throw new AppError(error.message, HTTP_STATUS.BAD_REQUEST);
    progressService.updateProgress(userId, "cv", 10).catch(() => {});
    return data;
  },

  async updateCV(cvId: string, userId: string, dto: UpdateCVDto) {
    const { data, error } = await supabaseAdmin
      .from("cvs")
      .update(dto)
      .eq("id", cvId)
      .eq("user_id", userId)
      .select("id, title, ats_score, match_score, updated_at")
      .single();
    if (error) throw new AppError(error.message, HTTP_STATUS.BAD_REQUEST);
    if (!data) throw new AppError("CV not found", HTTP_STATUS.NOT_FOUND);
    return data;
  },

  async deleteCV(cvId: string, userId: string) {
    const { error } = await supabaseAdmin
      .from("cvs")
      .delete()
      .eq("id", cvId)
      .eq("user_id", userId);
    if (error) throw new AppError(error.message, HTTP_STATUS.BAD_REQUEST);
    return { success: true };
  },

  async upsertSections(cvId: string, userId: string, dto: UpsertSectionsDto) {
    const { data: cv } = await supabaseAdmin
      .from("cvs").select("id").eq("id", cvId).eq("user_id", userId).single();
    if (!cv) throw new AppError("CV not found", HTTP_STATUS.NOT_FOUND);

    await supabaseAdmin.from("cv_sections").delete().eq("cv_id", cvId);
    const rows = dto.sections.map((s) => ({ cv_id: cvId, ...s }));
    const { data, error } = await supabaseAdmin
      .from("cv_sections").insert(rows).select("*");
    if (error) throw new AppError(error.message, HTTP_STATUS.BAD_REQUEST);
    return data ?? [];
  },

  async uploadCV(cvId: string, userId: string, file: Express.Multer.File): Promise<{ file_url: string; extracted_text: string; sections: Record<string, unknown>; links: Record<string, string> }> {
    const { data: cv } = await supabaseAdmin
      .from("cvs").select("id").eq("id", cvId).eq("user_id", userId).single();
    if (!cv) throw new AppError("CV not found", HTTP_STATUS.NOT_FOUND);

    const ext = file.mimetype === "application/pdf" ? "pdf"
               : file.mimetype === "image/png"      ? "png"
               : file.mimetype === "image/jpeg"     ? "jpg"
               : "txt";
    const storagePath = `${userId}/${cvId}.${ext}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from("cv-files")
      .upload(storagePath, file.buffer, { contentType: file.mimetype, upsert: true });
    if (uploadError) throw new AppError(`Storage upload failed: ${uploadError.message}`, HTTP_STATUS.INTERNAL_SERVER_ERROR);

    const emptySkills = { languages: [], frameworks: [], tools: [], other: [] };
    const emptyResult = { raw_text: "", sections: { summary: "", experience: [], education: [], skills: emptySkills, projects: [] } };

    const file_b64 = file.buffer.toString("base64");
    let cvResult: { raw_text: string; sections: Record<string, unknown> };
    try {
      cvResult = await callPython(
        `${pythonUrls.moduleD()}/extract-cv`,
        { file_b64, mimetype: file.mimetype },
        emptyResult
      ) as { raw_text: string; sections: Record<string, unknown> };
    } catch (extractErr: any) {
      // Module D returned an HTTP error (e.g. 422 — could not extract text).
      // Still save the file; just return empty sections so the user can fill manually.
      console.warn(`[CV] Extraction failed for ${cvId}: ${extractErr.message}`);
      cvResult = emptyResult;
    }

    const sections = cvResult.sections ?? {};
    const links = (sections.links ?? {}) as Record<string, string>;

    // Persist the permanent storage path, the OCR'd raw text (reused by
    // analysis so Module C never has to re-extract), + any extracted links
    const cvUpdate: Record<string, unknown> = {
      file_path: storagePath,
      file_url: null,
      extracted_text: cvResult.raw_text ?? "",
    };
    if (links.github)   cvUpdate.github_url   = links.github;
    if (links.linkedin) cvUpdate.linkedin_url = links.linkedin;
    await supabaseAdmin.from("cvs").update(cvUpdate).eq("id", cvId);

    // Auto-save extracted sections so data is preserved without a manual Save click
    await supabaseAdmin.from("cv_sections").delete().eq("cv_id", cvId);
    await supabaseAdmin.from("cv_sections").insert([
      { cv_id: cvId, section_type: "summary",    content: { text: sections.summary ?? "" },                              order_index: 0 },
      { cv_id: cvId, section_type: "experience", content: { entries: sections.experience ?? [] },                        order_index: 1 },
      { cv_id: cvId, section_type: "education",  content: { entries: sections.education  ?? [] },                        order_index: 2 },
      { cv_id: cvId, section_type: "skills",     content: { skills:  sections.skills     ?? emptySkills },               order_index: 3 },
      { cv_id: cvId, section_type: "projects",   content: { entries: sections.projects   ?? [] },                        order_index: 4 },
    ]);

    progressService.updateProgress(userId, "cv", 30).catch(() => {});

    // Return a fresh signed URL to the caller for immediate display
    const { data: signedData } = await supabaseAdmin.storage
      .from("cv-files")
      .createSignedUrl(storagePath, 3600);
    const file_url = signedData?.signedUrl ?? storagePath;

    return { file_url, extracted_text: cvResult.raw_text ?? "", sections, links };
  },

  /** Text for analysis: the CURRENT saved sections (so edits affect the score),
   *  falling back to the raw OCR text from upload when sections are empty. */
  async getCvText(cvId: string, cv?: Record<string, any>): Promise<string> {
    const { data: sections } = await supabaseAdmin
      .from("cv_sections").select("section_type, content").eq("cv_id", cvId).order("order_index");

    const parts: string[] = [];
    for (const s of sections ?? []) {
      const c = (s.content ?? {}) as Record<string, any>;
      if (s.section_type === "summary" && c.text) parts.push(`Summary\n${c.text}`);
      if (s.section_type === "experience") {
        for (const e of c.entries ?? []) {
          parts.push(`Experience: ${e.role ?? ""} at ${e.company ?? ""} (${e.start_date ?? ""} - ${e.end_date ?? ""})\n${(e.bullets ?? []).join("\n")}`);
        }
      }
      if (s.section_type === "education") {
        for (const e of c.entries ?? []) parts.push(`Education: ${e.degree ?? ""} ${e.field ?? ""}, ${e.institution ?? ""} (${e.start_date ?? ""} - ${e.end_date ?? ""})`);
      }
      if (s.section_type === "skills") {
        const sk = c.skills ?? {};
        parts.push(`Skills: ${[...(sk.languages ?? []), ...(sk.frameworks ?? []), ...(sk.tools ?? []), ...(sk.other ?? [])].join(", ")}`);
      }
      if (s.section_type === "projects") {
        for (const p of c.entries ?? []) parts.push(`Project: ${p.name ?? ""} — ${p.description ?? ""} (${(p.tech_stack ?? []).join(", ")})`);
      }
    }

    // Keep contact links in the text — the ATS heuristic scores their presence
    const contact = [cv?.github_url, cv?.linkedin_url].filter(Boolean).join(" | ");
    const sectionsText = [contact, ...parts].filter(Boolean).join("\n\n").trim();

    // Sections too sparse (e.g. extraction failed and user never edited) —
    // fall back to the raw OCR text from upload.
    if (sectionsText.length < 80 && cv?.extracted_text?.trim()) {
      return cv.extracted_text as string;
    }
    return sectionsText;
  },

  async analyzeCV(cvId: string, userId: string, dto: AnalyzeCVDto) {
    const { data: cv } = await supabaseAdmin
      .from("cvs").select("*").eq("id", cvId).eq("user_id", userId).single();
    if (!cv) throw new AppError("CV not found", HTTP_STATUS.NOT_FOUND);

    // Generate a fresh signed URL from file_path for Module C
    let resolvedFileUrl: string | null = dto.file_url ?? null;
    if (!resolvedFileUrl) {
      const storedPath = cv.file_path ?? (cv.file_url && !cv.file_url.startsWith("http") ? cv.file_url : null);
      if (storedPath) {
        const { data: signedData } = await supabaseAdmin.storage
          .from("cv-files")
          .createSignedUrl(storedPath, 3600);
        resolvedFileUrl = signedData?.signedUrl ?? null;
      }
    }

    // Prefer the text already extracted by Module D's OCR at upload time —
    // Module C's own extractor (PyPDF2) cannot read scanned/image CVs.
    const cvText = await cvService.getCvText(cvId, cv);

    const result = await callPython(
      `${pythonUrls.moduleC()}/analyze`,
      {
        cv_id: cvId,
        cv_text: cvText,
        file_url: resolvedFileUrl,
        github_url: dto.github_url ?? cv.github_url,
      },
      MOCK_CV_ANALYSIS
    ) as typeof MOCK_CV_ANALYSIS;

    // Compute overall match_score as average of top-3 job match percentages
    let matchScore: number | null = null;
    if (result.job_matches?.length) {
      const top = result.job_matches.slice(0, 3);
      matchScore = Math.round(top.reduce((s: number, m: any) => s + (m.match_pct ?? 0), 0) / top.length);
    }

    // Store analysis results back into DB
    await supabaseAdmin.from("cvs").update({
      ats_score: result.ats_score,
      match_score: matchScore,
      bert_skills: result.extracted_skills,
      github_verified_skills: result.github_verified,
    }).eq("id", cvId);

    // Map Module C's response fields to the DB column names (job_title /
    // section_type) — spreading the raw objects fails silently otherwise.
    await supabaseAdmin.from("cv_job_matches").delete().eq("cv_id", cvId);
    if (result.job_matches?.length) {
      const { error: jmError } = await supabaseAdmin.from("cv_job_matches").insert(
        result.job_matches.map((m: any) => ({
          cv_id:      cvId,
          job_title:  m.title ?? m.job_title ?? "Unknown role",
          company:    m.company ?? null,
          match_pct:  m.match_pct ?? null,
          skill_gaps: m.skill_gaps ?? [],
        }))
      );
      if (jmError) console.error(`[CV] job_matches insert failed: ${jmError.message}`);
    }

    await supabaseAdmin.from("cv_suggestions").delete().eq("cv_id", cvId);
    if (result.suggestions?.length) {
      const { error: sgError } = await supabaseAdmin.from("cv_suggestions").insert(
        result.suggestions.map((s: any, i: number) => ({
          cv_id:        cvId,
          section_type: s.section ?? s.section_type ?? null,
          issue:        s.issue ?? "",
          fix_example:  s.fix_example ?? null,
          priority:     i + 1,
        }))
      );
      if (sgError) console.error(`[CV] suggestions insert failed: ${sgError.message}`);
    }

    progressService.updateProgress(userId, "cv", 80).catch(() => {});

    notificationService.sendNotification(
      userId,
      "CV Analysis Complete",
      `Your CV scored ${result.ats_score}/100 ATS score with ${result.job_matches?.length ?? 0} job matches found.`,
      "success"
    ).catch(() => {});

    return result;
  },

  /** Cross-check the CV's Projects section against the user's connected GitHub repos. */
  async verifyProjects(cvId: string, userId: string) {
    const { data: cv } = await supabaseAdmin
      .from("cvs").select("id").eq("id", cvId).eq("user_id", userId).single();
    if (!cv) throw new AppError("CV not found", HTTP_STATUS.NOT_FOUND);

    const { data: sectionRow } = await supabaseAdmin
      .from("cv_sections").select("content")
      .eq("cv_id", cvId).eq("section_type", "projects").maybeSingle();
    const projects: Array<{ name?: string; url?: string; tech_stack?: string[] }> =
      (sectionRow?.content as any)?.entries ?? [];
    if (!projects.length) {
      throw new AppError("No projects found in this CV — add a Projects section first.", HTTP_STATUS.BAD_REQUEST);
    }

    const { github_username, repos } = await githubService.listRepoData(userId);

    const results = projects.map((project) => {
      const ghUrlMatch = (project.url ?? "").match(/github\.com\/([\w.-]+)\/([\w.-]+)/i);
      const urlOwner = ghUrlMatch?.[1]?.toLowerCase() ?? null;
      const urlRepoName = ghUrlMatch?.[2]?.replace(/\.git$/i, "") ?? null;

      // 1. direct match on the project's GitHub URL, 2. fuzzy match on name
      let repo = urlRepoName
        ? repos.find((r) => normTech(r.name) === normTech(urlRepoName)) ?? null
        : null;
      if (!repo && project.name) {
        const pn = normTech(project.name);
        repo = repos.find((r) => {
          const rn = normTech(r.name);
          return pn.length >= 4 && (rn === pn || rn.includes(pn) || pn.includes(rn));
        }) ?? null;
      }

      const ownedByUser = urlOwner !== null
        ? urlOwner === github_username.toLowerCase()
        : repo !== null; // matched from the user's own repo list

      const techStack = project.tech_stack ?? [];
      let languagesMatched: string[] = [];
      let languagesUnverified: string[] = techStack;
      if (repo) {
        const repoTerms = new Set([...repo.languages, ...repo.topics].map(normTech));
        const techVerified = (tech: string) =>
          repoTerms.has(normTech(tech)) ||
          (TECH_TO_LANGS[normTech(tech)] ?? []).some((lang) => repoTerms.has(normTech(lang)));
        languagesMatched   = techStack.filter(techVerified);
        languagesUnverified = techStack.filter((t) => !techVerified(t));
      }

      const stackRatio = techStack.length ? languagesMatched.length / techStack.length : 0;
      const confidence = !repo ? 0
        : Math.round((0.5 + (ownedByUser ? 0.2 : 0) + 0.3 * stackRatio) * 100) / 100;

      return {
        name:                 project.name ?? "(unnamed project)",
        claimed_url:          project.url ?? null,
        found:                repo !== null,
        repo_url:             repo?.html_url ?? null,
        owned_by_user:        ownedByUser,
        is_fork:              repo?.fork ?? false,
        last_pushed:          repo?.pushed_at ?? null,
        languages_matched:    languagesMatched,
        languages_unverified: languagesUnverified,
        confidence,
      };
    });

    const verification = {
      github_username,
      checked_at: new Date().toISOString(),
      summary: {
        total:    results.length,
        verified: results.filter((r) => r.found && r.owned_by_user).length,
        flagged:  results.filter((r) => !r.found || !r.owned_by_user).length,
      },
      results,
    };

    await supabaseAdmin.from("cvs").update({ project_verification: verification }).eq("id", cvId);
    return verification;
  },

  /** Attach a real job post to a CV and compare using Modules C, A, and D. */
  async attachJobPost(cvId: string, userId: string, dto: { title?: string; job_text: string }) {
    const { data: cv } = await supabaseAdmin
      .from("cvs").select("*").eq("id", cvId).eq("user_id", userId).single();
    if (!cv) throw new AppError("CV not found", HTTP_STATUS.NOT_FOUND);

    const cvText = await cvService.getCvText(cvId, cv);
    if (!cvText) {
      throw new AppError("This CV has no content yet — upload a file or fill in sections first.", HTTP_STATUS.BAD_REQUEST);
    }

    // 1. Module C: skill match + readiness against the job post
    let comparison: typeof MOCK_JOB_COMPARISON;
    try {
      comparison = await callPython(
        `${pythonUrls.moduleC()}/compare-job`,
        { cv_text: cvText, job_text: dto.job_text },
        MOCK_JOB_COMPARISON
      ) as typeof MOCK_JOB_COMPARISON;
    } catch (err: any) {
      // Surface Module C validation errors (e.g. no skills found) as 422 to the client
      if (err.message?.includes("(422)")) {
        const msg = err.message.replace(/^Python service error \(\d+\):\s*/, "");
        throw new AppError(msg || "No recognisable skills found in the job post text.", 422);
      }
      throw err;
    }

    // 2. Module A: annotate gap skills with market demand (best effort)
    let missingWithDemand = (comparison.missing_skills ?? []).map((skill) => ({ skill } as {
      skill: string; predicted_weekly_demand?: number; velocity?: string;
    }));
    if (missingWithDemand.length) {
      try {
        const forecast = await callPython(
          `${pythonUrls.moduleA()}/forecast`,
          { user_id: userId, skills: comparison.missing_skills },
          { trending: [], matched: false }
        ) as { matched: boolean; trending: Array<{ skill: string; predicted_weekly_demand: number; velocity: string }> };
        if (forecast.matched) {
          const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
          const byName = new Map(forecast.trending.map((t) => [norm(t.skill), t]));
          missingWithDemand = (comparison.missing_skills ?? []).map((skill) => {
            const t = byName.get(norm(skill));
            return t
              ? { skill, predicted_weekly_demand: t.predicted_weekly_demand, velocity: t.velocity }
              : { skill };
          });
        }
      } catch { /* forecast data unavailable — keep plain gap list */ }
    }

    // 3. Module D: LLM tailoring suggestions
    const { data: sectionRows } = await supabaseAdmin
      .from("cv_sections").select("section_type, content").eq("cv_id", cvId);
    const sectionsByType = Object.fromEntries(
      (sectionRows ?? []).map((s) => [s.section_type, s.content])
    );
    const tailoring = await callPython(
      `${pythonUrls.moduleD()}/tailor-cv`,
      { sections: sectionsByType, job_text: dto.job_text },
      MOCK_TAILORING
    ) as typeof MOCK_TAILORING;

    const { data, error } = await supabaseAdmin
      .from("cv_job_posts")
      .insert({
        cv_id:      cvId,
        title:      dto.title ?? null,
        job_text:   dto.job_text,
        comparison: { ...comparison, missing_with_demand: missingWithDemand },
        tailoring,
      })
      .select("id, title, comparison, tailoring, created_at")
      .single();
    if (error) throw new AppError(error.message, HTTP_STATUS.BAD_REQUEST);
    return data;
  },

  async deleteJobPost(cvId: string, userId: string, jobPostId: string) {
    const { data: cv } = await supabaseAdmin
      .from("cvs").select("id").eq("id", cvId).eq("user_id", userId).single();
    if (!cv) throw new AppError("CV not found", HTTP_STATUS.NOT_FOUND);

    const { error } = await supabaseAdmin
      .from("cv_job_posts").delete().eq("id", jobPostId).eq("cv_id", cvId);
    if (error) throw new AppError(error.message, HTTP_STATUS.BAD_REQUEST);
    return { success: true };
  },
};
