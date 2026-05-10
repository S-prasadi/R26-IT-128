import { supabaseAdmin } from "../config/supabase";
import { AppError } from "../middlewares/error.middleware";
import { HTTP_STATUS } from "../constants/http";
import { callPython, pythonUrls } from "./python.service";
import { notificationService } from "./notification.service";
import { progressService } from "./progress.service";
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

    const [{ data: sections }, { data: matches }, { data: suggestions }] = await Promise.all([
      supabaseAdmin.from("cv_sections").select("*").eq("cv_id", cvId).order("order_index"),
      supabaseAdmin.from("cv_job_matches").select("*").eq("cv_id", cvId).order("match_pct", { ascending: false }),
      supabaseAdmin.from("cv_suggestions").select("*").eq("cv_id", cvId).order("priority"),
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

    // Persist the permanent storage path + any extracted links
    const cvUpdate: Record<string, unknown> = { file_path: storagePath, file_url: null };
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

    const result = await callPython(
      `${pythonUrls.moduleC()}/analyze`,
      {
        cv_id: cvId,
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

    await supabaseAdmin.from("cv_job_matches").delete().eq("cv_id", cvId);
    if (result.job_matches?.length) {
      await supabaseAdmin.from("cv_job_matches").insert(
        result.job_matches.map((m: any) => ({ cv_id: cvId, ...m }))
      );
    }

    await supabaseAdmin.from("cv_suggestions").delete().eq("cv_id", cvId);
    if (result.suggestions?.length) {
      await supabaseAdmin.from("cv_suggestions").insert(
        result.suggestions.map((s: any, i: number) => ({ cv_id: cvId, ...s, priority: i + 1 }))
      );
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
};
