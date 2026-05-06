import { supabaseAdmin } from "../config/supabase";
import { AppError } from "../middlewares/error.middleware";
import { HTTP_STATUS } from "../constants/http";
import { callPython, pythonUrls } from "./python.service";
import { notificationService } from "./notification.service";
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

    return { ...cv, sections: sections ?? [], job_matches: matches ?? [], suggestions: suggestions ?? [] };
  },

  async createCV(userId: string, dto: CreateCVDto) {
    const { data, error } = await supabaseAdmin
      .from("cvs")
      .insert({ user_id: userId, ...dto })
      .select("id, title, ats_score, match_score, github_url, linkedin_url, created_at")
      .single();
    if (error) throw new AppError(error.message, HTTP_STATUS.BAD_REQUEST);
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

  async analyzeCV(cvId: string, userId: string, dto: AnalyzeCVDto) {
    const { data: cv } = await supabaseAdmin
      .from("cvs").select("*").eq("id", cvId).eq("user_id", userId).single();
    if (!cv) throw new AppError("CV not found", HTTP_STATUS.NOT_FOUND);

    const result = await callPython(
      `${pythonUrls.moduleC()}/analyze`,
      {
        cv_id: cvId,
        file_url: dto.file_url ?? cv.file_url,
        github_url: dto.github_url ?? cv.github_url,
      },
      MOCK_CV_ANALYSIS
    ) as typeof MOCK_CV_ANALYSIS;

    // Store analysis results back into DB
    await supabaseAdmin.from("cvs").update({
      ats_score: result.ats_score,
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

    notificationService.sendNotification(
      userId,
      "CV Analysis Complete",
      `Your CV scored ${result.ats_score}/100 ATS score with ${result.job_matches?.length ?? 0} job matches found.`,
      "success"
    ).catch(() => {});

    return result;
  },
};
