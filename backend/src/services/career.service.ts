import { supabaseAdmin } from "../config/supabase";
import { AppError } from "../middlewares/error.middleware";
import { HTTP_STATUS } from "../constants/http";
import axios from "axios";
import { callPython, pythonUrls, PythonUnavailableError } from "./python.service";
import { notificationService } from "./notification.service";
import type {
  UpsertGoalDto,
  AddRoadmapItemDto,
  UpdateRoadmapItemDto,
  PredictPathDto,
} from "../validations/career.validation";

// Module B's actual response shape
interface ModuleBStepGate {
  role:       string;
  skills:     string[];
  eta_months: number;
}
interface ModuleBPath {
  path_number:    number;
  target_role:    string;
  confidence:     number;
  career_steps:   string[];
  step_gates?:    ModuleBStepGate[];
  readiness_score: number;
  skills_matched: string[];
  skills_needed:  string[];
  is_goal?:       boolean; // marks the goal-directed path (always reaches the set goal)
}
interface ModuleBResponse {
  paths: ModuleBPath[];
}

// Module A (/forecast) response shape — the subset we use to add market context
interface ModuleATrending {
  skill: string;
  velocity: "rising" | "stable" | "falling";
  change_pct: number;
  predicted_weekly_demand: number;
}
interface ModuleAEarlyWarning {
  skill: string;
  weeks_ahead: number;
  correlation: number;
}
interface ModuleAForecast {
  trending: ModuleATrending[];
  early_warnings: ModuleAEarlyWarning[];
}

// Per gap-skill market context attached to each path for the UI to prioritise.
interface SkillInsight {
  skill: string;
  velocity: "rising" | "stable" | "falling" | "unknown";
  change_pct: number;
  demand: number;
  early_warning?: number; // weeks until the skill is expected to spike locally
}

// Minimal fallback so enrichment degrades gracefully when Module A is down.
const MODULE_A_FORECAST_MOCK: ModuleAForecast = { trending: [], early_warnings: [] };

const norm = (s: string) => s.toLowerCase().trim();

// Blend the model's readiness with the user's real proficiency and gap coverage.
function blendReadiness(
  modelReadiness: number,
  skillsMatched: string[],
  skillsNeeded: string[],
  profBySkill: Map<string, number>
): number {
  const matchedProfs = skillsMatched
    .map((s) => profBySkill.get(norm(s)))
    .filter((v): v is number => typeof v === "number");
  // When we have no proficiency signal (typed/CV skills the user never rated),
  // fall back to the model's own readiness for that term instead of 0 — otherwise
  // the blend collapses to ~0.5·model and badly under-reports readiness.
  const proficiencyFactor = matchedProfs.length
    ? matchedProfs.reduce((a, b) => a + b, 0) / matchedProfs.length / 5 // 1–5 → 0–1
    : modelReadiness;
  const total = skillsMatched.length + skillsNeeded.length;
  const coverage = total ? skillsMatched.length / total : modelReadiness;
  const blended = 0.5 * modelReadiness + 0.3 * proficiencyFactor + 0.2 * coverage;
  return Math.max(0, Math.min(1, Number(blended.toFixed(3))));
}

// Build market-context insights for a path's gap skills from Module A data.
function buildSkillInsights(
  skillsNeeded: string[],
  trendBySkill: Map<string, ModuleATrending>,
  warnBySkill: Map<string, ModuleAEarlyWarning>
): SkillInsight[] {
  return skillsNeeded.map((skill) => {
    const t = trendBySkill.get(norm(skill));
    const w = warnBySkill.get(norm(skill));
    const insight: SkillInsight = {
      skill,
      velocity: t?.velocity ?? "unknown",
      change_pct: t?.change_pct ?? 0,
      demand: t?.predicted_weekly_demand ?? 0,
    };
    if (w) insight.early_warning = w.weeks_ahead;
    return insight;
  });
}

// Order gap skills so the highest-leverage ones come first:
// rising > stable > falling/unknown, then by demand desc.
const VELOCITY_RANK: Record<string, number> = { rising: 0, stable: 1, falling: 2, unknown: 3 };
function rankSkillInsights(a: SkillInsight, b: SkillInsight): number {
  const r = VELOCITY_RANK[a.velocity]! - VELOCITY_RANK[b.velocity]!;
  return r !== 0 ? r : b.demand - a.demand;
}

// Aggregate a role's relevant skills into one market summary for its graph node.
function buildNodeMarket(skills: string[], trendBySkill: Map<string, ModuleATrending>) {
  const trends = skills.map((s) => trendBySkill.get(norm(s))).filter((t): t is ModuleATrending => !!t);
  if (!trends.length) return { velocity: "unknown" as const, demand_index: 0, top_rising: [] as string[] };
  const rising = trends.filter((t) => t.velocity === "rising").length;
  const falling = trends.filter((t) => t.velocity === "falling").length;
  const velocity = rising > falling ? "rising" : falling > rising ? "falling" : "stable";
  const demand_index = Math.round(trends.reduce((a, t) => a + t.predicted_weekly_demand, 0) / trends.length);
  const top_rising = trends
    .filter((t) => t.velocity === "rising")
    .sort((a, b) => b.change_pct - a.change_pct)
    .slice(0, 3)
    .map((t) => t.skill);
  return { velocity: velocity as "rising" | "stable" | "falling", demand_index, top_rising };
}

// Mock uses Module B's format so the normalizer handles both paths uniformly
const MODULE_B_MOCK: ModuleBResponse = {
  paths: [
    {
      path_number:    1,
      target_role:    "Senior Software Engineer",
      confidence:     0.87,
      career_steps:   ["Student", "Junior Software Engineer", "Software Engineer", "Senior Software Engineer"],
      readiness_score: 0.72,
      skills_matched: ["React", "Node.js", "PostgreSQL"],
      skills_needed:  ["AWS", "Kubernetes", "System Design"],
    },
    {
      path_number:    2,
      target_role:    "Tech Lead",
      confidence:     0.72,
      career_steps:   ["Student", "Full-Stack Developer", "Tech Lead"],
      readiness_score: 0.55,
      skills_matched: ["React", "Node.js"],
      skills_needed:  ["Team Leadership", "AWS", "MongoDB"],
    },
    {
      path_number:    3,
      target_role:    "DevOps Engineer",
      confidence:     0.64,
      career_steps:   ["Student", "DevOps Intern", "DevOps Engineer"],
      readiness_score: 0.40,
      skills_matched: ["Node.js"],
      skills_needed:  ["Docker", "Kubernetes", "Terraform", "CI/CD"],
    },
  ],
};

// Per-node metadata used by the interactive graph + detail drawer.
interface NodeMeta {
  readiness?:   number;     // best path readiness where this role is the target
  gate_skills?: string[];   // skills that unlock reaching this role
  eta_months?:  number;     // time to reach this role from the previous step
  market?:      { velocity: "rising" | "stable" | "falling" | "unknown"; demand_index: number; top_rising: string[] };
  is_goal?:     boolean;    // this role is the user's set goal (highlighted in the graph)
}

function normalizeModuleBResponse(raw: ModuleBResponse, currentRole: string) {
  const nodeMap = new Map<string, string>();
  const graph_nodes: { id: string; label: string; type: "current" | "role"; meta?: NodeMeta }[] = [];
  const graph_edges: { source: string; target: string; probability: number; timeframe: string; skills?: string[] }[] = [];
  const nodeMetaByRole = new Map<string, NodeMeta>();
  let nodeCounter = 0;

  function getOrCreateNode(role: string, isRoot: boolean) {
    if (!nodeMap.has(role)) {
      const id = `n${nodeCounter++}`;
      nodeMap.set(role, id);
      const meta: NodeMeta = {};
      nodeMetaByRole.set(role, meta);
      graph_nodes.push({ id, label: role, type: isRoot ? "current" : "role", meta });
    }
    return nodeMap.get(role)!;
  }

  // Relative confidence: the model spreads softmax mass across ~180 classes, so
  // absolute top-1 probability is tiny (~0.04). Normalising across the returned
  // paths gives a meaningful "share of confidence among your options" for the UI.
  // The goal-directed path is excluded so it doesn't perturb the predicted paths' shares.
  const totalConf = raw.paths.filter((p) => !p.is_goal).reduce((sum, p) => sum + (p.confidence || 0), 0);

  const paths = raw.paths.map((p) => {
    const steps = p.career_steps.length > 0 ? p.career_steps : [currentRole, p.target_role];
    const gateByRole = new Map((p.step_gates ?? []).map((g) => [g.role, g]));

    // Ensure root matches the actual current role if steps[0] differs
    const rootLabel = steps[0];
    getOrCreateNode(rootLabel, true);

    const transitions = steps.slice(1).map((role, i) => {
      const prevRole = steps[i]; // i is 0-based in slice, so prev is steps[i]
      const isLast = i === steps.length - 2;
      const gate = gateByRole.get(role);
      const gateSkills = gate?.skills ?? (isLast ? p.skills_needed : []);
      const etaMonths = gate?.eta_months ?? (6 + i * 12);

      const srcId = getOrCreateNode(prevRole, prevRole === steps[0]);
      const tgtId = getOrCreateNode(role, false);

      // Accumulate node metadata (best readiness + gate to reach this role)
      const meta = nodeMetaByRole.get(role)!;
      meta.readiness = Math.max(meta.readiness ?? 0, p.readiness_score);
      if (gateSkills.length && !meta.gate_skills) meta.gate_skills = gateSkills;
      if (meta.eta_months == null) meta.eta_months = etaMonths;

      // Only add edge if not already present
      const edgeKey = `${srcId}->${tgtId}`;
      if (!graph_edges.some((e) => `${e.source}->${e.target}` === edgeKey)) {
        graph_edges.push({
          source:    srcId,
          target:    tgtId,
          probability: p.confidence,
          timeframe: `~${etaMonths} months`,
          skills:    gateSkills,
        });
      }

      return {
        role,
        company_size:           "mid",
        industry:               "IT",
        timeframe_months:       etaMonths,
        required_skills:        isLast ? p.skills_matched : [],
        skill_gaps:             gateSkills,
        transition_probability: p.confidence,
      };
    });

    // Highlight the goal's terminal role node so the graph can flag it.
    if (p.is_goal) {
      const goalRole = steps[steps.length - 1];
      const goalMeta = nodeMetaByRole.get(goalRole);
      if (goalMeta) goalMeta.is_goal = true;
    }

    return {
      id:                  `path-${p.path_number}`,
      probability:         p.confidence,
      confidence_relative: p.is_goal ? p.confidence : (totalConf > 0 ? Number((p.confidence / totalConf).toFixed(4)) : 0),
      is_goal:             p.is_goal ?? false,
      transitions,
      // enrichment fields used by the frontend tree renderer
      career_steps:    steps,
      readiness_score: p.readiness_score,
      skills_matched:  p.skills_matched,
      skills_needed:   p.skills_needed,
    };
  });

  return { paths, graph_nodes, graph_edges, nodeMetaByRole };
}

export const careerService = {
  async getGoal(userId: string) {
    const { data } = await supabaseAdmin
      .from("career_goals")
      .select("id, target_role, target_industry, target_date, notes, skills_snapshot, cv_id, created_at, updated_at")
      .eq("user_id", userId)
      .maybeSingle();
    return data;
  },

  async upsertGoal(userId: string, dto: UpsertGoalDto) {
    const { data, error } = await supabaseAdmin
      .from("career_goals")
      .upsert({ user_id: userId, ...dto }, { onConflict: "user_id" })
      .select("id, target_role, target_industry, target_date, notes, skills_snapshot, cv_id, updated_at")
      .single();
    if (error) throw new AppError(error.message, HTTP_STATUS.BAD_REQUEST);
    return data;
  },

  async getRoadmap(userId: string) {
    const { data, error } = await supabaseAdmin
      .from("career_roadmap_items")
      .select("id, title, description, status, due_date, order_index, created_at, updated_at")
      .eq("user_id", userId)
      .order("order_index");
    if (error) throw new AppError(error.message, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    return data ?? [];
  },

  async addRoadmapItem(userId: string, dto: AddRoadmapItemDto) {
    const { data, error } = await supabaseAdmin
      .from("career_roadmap_items")
      .insert({ user_id: userId, ...dto })
      .select("id, title, description, status, due_date, order_index, created_at")
      .single();
    if (error) throw new AppError(error.message, HTTP_STATUS.BAD_REQUEST);
    return data;
  },

  async updateRoadmapItem(userId: string, itemId: string, dto: UpdateRoadmapItemDto) {
    const { data, error } = await supabaseAdmin
      .from("career_roadmap_items")
      .update(dto)
      .eq("id", itemId)
      .eq("user_id", userId)
      .select("id, title, status, order_index, updated_at")
      .single();
    if (error) throw new AppError(error.message, HTTP_STATUS.BAD_REQUEST);
    if (!data) throw new AppError("Item not found", HTTP_STATUS.NOT_FOUND);
    return data;
  },

  async deleteRoadmapItem(userId: string, itemId: string) {
    const { error } = await supabaseAdmin
      .from("career_roadmap_items")
      .delete()
      .eq("id", itemId)
      .eq("user_id", userId);
    if (error) throw new AppError(error.message, HTTP_STATUS.BAD_REQUEST);
    return { success: true };
  },

  async predictPath(userId: string, dto: PredictPathDto, userSkills: object[]) {
    const currentRole = dto.current_role ?? "Student";

    // Proficiency lookup (norm name → 1–5) used to ground the readiness score.
    const profBySkill = new Map<string, number>();
    const userSkillNames: string[] = [];
    for (const s of userSkills as any[]) {
      const name: string = s.skills?.name ?? s.name ?? "";
      if (!name) continue;
      userSkillNames.push(name);
      if (typeof s.proficiency_level === "number") profBySkill.set(norm(name), s.proficiency_level);
    }

    // Fold in skills extracted from the goal's attached CV (if any) so the
    // prediction reflects CV evidence, not just manually-tracked skills.
    const goal = await careerService.getGoal(userId);
    const cvSkillNames = goal?.cv_id ? await getCvSkillNames(goal.cv_id) : [];

    // What-if simulator: layer the requested additions/removals on top of the
    // real skill set before predicting (the result is not persisted — see below).
    // Removals are applied to the base set first, then additions — so an
    // explicitly added skill always wins over a removal of the same name.
    // Base skill set: the skills the user explicitly typed for this prediction win;
    // otherwise fall back to the auto-derived tracked-skills + CV set.
    const removeSet = new Set((dto.remove_skills ?? []).map(norm));
    const explicit = (dto.skills ?? []).map(norm).filter(Boolean);
    const autoBase = [...userSkillNames, ...cvSkillNames].map(norm).filter(Boolean);
    const base = (explicit.length ? explicit : autoBase).filter((s) => !removeSet.has(s));
    const skillNames = Array.from(new Set([...base, ...(dto.add_skills ?? []).map(norm).filter(Boolean)]));

    // Module B is essential — never substitute fake paths. If it's unreachable we
    // surface a clean "offline" error so the UI can show its offline state.
    let raw: ModuleBResponse;
    try {
      raw = await callPython(
        `${pythonUrls.moduleB()}/predict`,
        {
          skills:            skillNames,
          current_role:      currentRole,
          experience_months: dto.experience_months ?? 0,
          num_projects:      dto.num_projects      ?? 0,
          top_k:             3,
        },
        MODULE_B_MOCK,
        { throwOnUnreachable: true }
      ) as ModuleBResponse;
    } catch (e) {
      if (e instanceof PythonUnavailableError) {
        throw new AppError("The career model is offline. Please try again later.", HTTP_STATUS.SERVICE_UNAVAILABLE);
      }
      throw e;
    }

    // Goal-directed path: a path that always reaches the user's set goal role,
    // shown alongside (not replacing) the skills-predicted paths. Best-effort —
    // a failure here must not fail the main prediction.
    let goalRaw: ModuleBPath | null = null;
    if (goal?.target_role) {
      const gres = await callPython(
        `${pythonUrls.moduleB()}/predict-to-target`,
        {
          skills:            skillNames,
          current_role:      currentRole,
          target_role:       goal.target_role,
          experience_months: dto.experience_months ?? 0,
          num_projects:      dto.num_projects      ?? 0,
        },
        { path: null }
      ) as { path: ModuleBPath | null };
      goalRaw = gres?.path ?? null;
    }

    // Normalise the predicted paths + (optionally) the goal path together so the
    // graph includes the goal branch; we split them back apart after enrichment.
    const combined: ModuleBResponse = {
      paths: goalRaw ? [...raw.paths, { ...goalRaw, is_goal: true, path_number: 99 }] : raw.paths,
    };
    const { nodeMetaByRole, ...result } = normalizeModuleBResponse(combined, currentRole);

    // ── Enrich with Module A market forecast ──────────────────────────────
    // Query the forecast for every role-relevant skill (gaps + matched + gate
    // skills) so we can build both per-gap insights AND per-node market summaries.
    const gateSkills = result.graph_edges.flatMap((e) => e.skills ?? []);
    const marketSkills = Array.from(new Set(
      result.paths.flatMap((p) => [...(p.skills_needed ?? []), ...(p.skills_matched ?? [])]).concat(gateSkills)
    ));
    let forecast = MODULE_A_FORECAST_MOCK;
    if (marketSkills.length) {
      forecast = await callPython(
        `${pythonUrls.moduleA()}/forecast`,
        { user_id: userId, skills: marketSkills },
        MODULE_A_FORECAST_MOCK
      ) as ModuleAForecast;
    }
    const trendBySkill = new Map((forecast.trending ?? []).map((t) => [norm(t.skill), t]));
    const warnBySkill = new Map((forecast.early_warnings ?? []).map((w) => [norm(w.skill), w]));

    // Per-node market summary: aggregate the node's gate/required skills' trends.
    const targetSkillsByRole = new Map<string, string[]>();
    for (const p of result.paths) {
      const tgt = p.career_steps?.[p.career_steps.length - 1];
      if (tgt) targetSkillsByRole.set(tgt, [...(p.skills_needed ?? []), ...(p.skills_matched ?? [])]);
    }
    for (const [role, meta] of nodeMetaByRole) {
      const skills = [...(meta.gate_skills ?? []), ...(targetSkillsByRole.get(role) ?? [])];
      meta.market = buildNodeMarket(skills, trendBySkill);
    }

    const paths = result.paths.map((p) => ({
      ...p,
      readiness_score: blendReadiness(p.readiness_score, p.skills_matched ?? [], p.skills_needed ?? [], profBySkill),
      skill_insights: buildSkillInsights(p.skills_needed ?? [], trendBySkill, warnBySkill).sort(rankSkillInsights),
    }));

    // Keep each target role's graph-node readiness in sync with its (blended)
    // path readiness, so the graph, drawer and step-list all show the same number.
    for (const p of paths) {
      const tgt = p.career_steps?.[p.career_steps.length - 1];
      if (!tgt) continue;
      const meta = nodeMetaByRole.get(tgt);
      if (meta) meta.readiness = p.readiness_score;
    }

    // Split the goal-directed path out into its own field; the predicted-paths
    // list stays exactly as it was (graph still contains the goal branch).
    const predicted = paths.filter((p) => !p.is_goal);
    const goal_path = paths.find((p) => p.is_goal) ?? null;
    const enriched = { ...result, paths: predicted, goal_path };

    // ── Persist snapshot (skipped for what-if simulations) ────────────────
    const topPath = enriched.paths[0];
    const topTargetRole = topPath?.career_steps?.[topPath.career_steps.length - 1] ?? null;
    if (!dto.simulate) {
      // Persistence is best-effort: a failed snapshot must not fail the prediction.
      const { error: snapErr } = await supabaseAdmin.from("career_predictions").insert({
        user_id:           userId,
        current_role:      currentRole,
        experience_months: dto.experience_months ?? 0,
        result:            enriched,
        top_target_role:   topTargetRole,
        top_confidence:    topPath?.probability ?? null,
        top_readiness:     topPath?.readiness_score ?? null,
      });
      if (snapErr) console.error(`[career] prediction snapshot insert failed: ${snapErr.message}`);

      if (topPath) {
        notificationService.sendNotification(
          userId,
          "Career Path Prediction Ready",
          `Your top predicted path leads to ${topTargetRole ?? "your next role"} with ${Math.round(topPath.probability * 100)}% confidence.`,
          "info"
        ).catch(() => {});
      }
    }

    return enriched;
  },

  async getPredictions(userId: string) {
    const { data, error } = await supabaseAdmin
      .from("career_predictions")
      .select("id, current_role, top_target_role, top_confidence, top_readiness, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new AppError(error.message, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    return data ?? [];
  },

  async deletePrediction(userId: string, id: string) {
    const { error } = await supabaseAdmin
      .from("career_predictions")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw new AppError(error.message, HTTP_STATUS.BAD_REQUEST);
    return { success: true };
  },

  // Lightweight health check the Career page uses to show an online/offline badge
  // and pause predictions when the career model (Module B) is down.
  async getModelStatus() {
    const ping = async (url: string) => {
      try {
        const res = await axios.get(url, { timeout: 3000 });
        return res.data as any;
      } catch {
        return null;
      }
    };
    const [bInfo, aStatus] = await Promise.all([
      ping(`${pythonUrls.moduleB()}/model-info`),
      ping(`${pythonUrls.moduleA()}/api/status`),
    ]);
    return {
      module_b: {
        online:     bInfo != null,
        best_model: bInfo?.best_model ?? null,
        num_roles:  bInfo?.num_roles ?? null,
      },
      module_a: { online: aStatus != null },
    };
  },

  // Turn a predicted path's gap skills into roadmap items, rising-skills first,
  // skipping any skill that already has an item (case-insensitive title match).
  async generateRoadmap(userId: string, pathId: string) {
    const { data: latest, error: predErr } = await supabaseAdmin
      .from("career_predictions")
      .select("result")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (predErr) throw new AppError(predErr.message, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    if (!latest?.result) throw new AppError("Run a prediction first", HTTP_STATUS.BAD_REQUEST);

    const prediction = latest.result as { paths: { id: string; skill_insights?: SkillInsight[]; skills_needed?: string[] }[] };
    const path = prediction.paths.find((p) => p.id === pathId) ?? prediction.paths[0];
    if (!path) throw new AppError("Path not found", HTTP_STATUS.NOT_FOUND);

    const insights = path.skill_insights ?? [];
    const gapSkills = insights.length
      ? [...insights].sort(rankSkillInsights).map((i) => i.skill)
      : (path.skills_needed ?? []);
    if (!gapSkills.length) return { created: 0, items: [] };

    const { data: existing } = await supabaseAdmin
      .from("career_roadmap_items")
      .select("title, order_index")
      .eq("user_id", userId);
    const existingTitles = new Set((existing ?? []).map((r) => norm(r.title)));
    let nextOrder = (existing ?? []).reduce((max, r) => Math.max(max, r.order_index ?? 0), -1) + 1;

    const insightBySkill = new Map(insights.map((i) => [norm(i.skill), i]));
    const rows = gapSkills
      .filter((skill) => !existingTitles.has(norm(`Learn ${skill}`)))
      .map((skill) => {
        const ins = insightBySkill.get(norm(skill));
        const ctx = ins
          ? `Market: ${ins.velocity}${ins.change_pct ? ` (${ins.change_pct > 0 ? "+" : ""}${ins.change_pct}%)` : ""}${ins.early_warning ? ` · spikes locally in ~${ins.early_warning}w` : ""}`
          : "Skill gap from your predicted career path";
        // Suggest a target date: prioritise rising skills with a nearer deadline.
        const daysOut = ins?.velocity === "rising" ? 30 : ins?.velocity === "stable" ? 60 : 90;
        const due = new Date(Date.now() + daysOut * 86400000).toISOString().slice(0, 10);
        return {
          user_id:     userId,
          title:       `Learn ${skill}`,
          description: ctx,
          status:      "pending",
          due_date:    due,
          order_index: nextOrder++,
        };
      });
    if (!rows.length) return { created: 0, items: [] };

    const { data, error } = await supabaseAdmin
      .from("career_roadmap_items")
      .insert(rows)
      .select("id, title, description, status, due_date, order_index, created_at");
    if (error) throw new AppError(error.message, HTTP_STATUS.BAD_REQUEST);
    return { created: data?.length ?? 0, items: data ?? [] };
  },
};

// Read the skills the CV parser stored in cv_sections (section_type='skills').
async function getCvSkillNames(cvId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("cv_sections")
    .select("content")
    .eq("cv_id", cvId)
    .eq("section_type", "skills")
    .maybeSingle();
  const sk = (data?.content as any)?.skills ?? {};
  return [
    ...(sk.languages ?? []),
    ...(sk.frameworks ?? []),
    ...(sk.tools ?? []),
    ...(sk.other ?? []),
  ].filter((s: unknown): s is string => typeof s === "string" && s.trim().length > 0);
}
