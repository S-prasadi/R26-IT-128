import axios from "axios";
import { supabaseAdmin } from "../config/supabase";
import { AppError } from "../middlewares/error.middleware";
import { HTTP_STATUS } from "../constants/http";
import { env } from "../config/env";

// Maps GitHub language names to the skill names used in the master skills catalog
const LANG_TO_SKILL: Record<string, string> = {
  JavaScript:  "JavaScript",
  TypeScript:  "TypeScript",
  Python:      "Python",
  Java:        "Java",
  Go:          "Go",
  Rust:        "Rust",
  "C#":        "C#",
  "C++":       "C++",
  Ruby:        "Ruby",
  PHP:         "PHP",
  Kotlin:      "Kotlin",
  Swift:       "Swift",
  Dart:        "Flutter",
  HTML:        "HTML",
  CSS:         "CSS",
  Shell:       "Bash",
};

export const githubService = {
  getAuthUrl(state: string): string {
    if (!env.github.clientId || !env.github.clientSecret) {
      throw new AppError(
        "GitHub OAuth is not configured — set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in backend/.env",
        HTTP_STATUS.SERVICE_UNAVAILABLE
      );
    }
    const params = new URLSearchParams({
      client_id:    env.github.clientId,
      redirect_uri: env.github.redirectUri,
      scope:        "read:user repo",
      state,
    });
    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  },

  async exchangeCodeForToken(code: string): Promise<string> {
    const resp = await axios.post(
      "https://github.com/login/oauth/access_token",
      {
        client_id:     env.github.clientId,
        client_secret: env.github.clientSecret,
        code,
        redirect_uri:  env.github.redirectUri,
      },
      { headers: { Accept: "application/json" } }
    );
    const token = resp.data?.access_token as string | undefined;
    if (!token) throw new AppError("GitHub OAuth token exchange failed", HTTP_STATUS.INTERNAL_SERVER_ERROR);
    return token;
  },

  async connectGitHub(userId: string, code: string): Promise<{ github_username: string }> {
    const token = await githubService.exchangeCodeForToken(code);

    const userResp = await axios.get("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${token}`, "User-Agent": "PathwayIQ" },
    });
    const github_username: string = userResp.data.login;

    const { error } = await supabaseAdmin
      .from("user_github_tokens")
      .upsert({ user_id: userId, github_username, access_token: token, scopes: "read:user repo" });
    if (error) throw new AppError(error.message, HTTP_STATUS.INTERNAL_SERVER_ERROR);

    return { github_username };
  },

  async getStatus(userId: string): Promise<{ connected: boolean; github_username?: string; connected_at?: string }> {
    const { data } = await supabaseAdmin
      .from("user_github_tokens")
      .select("github_username, connected_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (!data) return { connected: false };
    return { connected: true, github_username: data.github_username, connected_at: data.connected_at };
  },

  async disconnect(userId: string): Promise<void> {
    await supabaseAdmin.from("user_github_tokens").delete().eq("user_id", userId);
  },

  /** Repos with language breakdown for CV project verification. */
  async listRepoData(userId: string): Promise<{
    github_username: string;
    repos: Array<{
      name: string; full_name: string; html_url: string; description: string | null;
      languages: string[]; topics: string[]; pushed_at: string; fork: boolean;
    }>;
  }> {
    const { data: tokenRow } = await supabaseAdmin
      .from("user_github_tokens")
      .select("access_token, github_username")
      .eq("user_id", userId)
      .single();
    if (!tokenRow) throw new AppError("GitHub not connected. Connect GitHub on the Skills page first.", HTTP_STATUS.BAD_REQUEST);

    const { access_token, github_username } = tokenRow as { access_token: string; github_username: string };
    const headers = { Authorization: `Bearer ${access_token}`, "User-Agent": "PathwayIQ" };

    const reposResp = await axios.get("https://api.github.com/user/repos", {
      headers,
      params: { per_page: 100, sort: "updated", visibility: "public" },
    });

    const repos = await Promise.all(
      (reposResp.data as Array<Record<string, any>>).map(async (repo, i) => {
        let languages: string[] = repo.language ? [repo.language] : [];
        // Full language breakdown only for the 30 most recent repos (rate limits)
        if (i < 30) {
          try {
            const langResp = await axios.get(`https://api.github.com/repos/${repo.full_name}/languages`, { headers });
            languages = Object.keys(langResp.data as Record<string, number>);
          } catch { /* empty repos */ }
        }
        return {
          name:        repo.name as string,
          full_name:   repo.full_name as string,
          html_url:    repo.html_url as string,
          description: (repo.description ?? null) as string | null,
          languages,
          topics:      (repo.topics ?? []) as string[],
          pushed_at:   repo.pushed_at as string,
          fork:        Boolean(repo.fork),
        };
      })
    );

    return { github_username, repos };
  },

  async verifySkills(userId: string): Promise<{ updated: number; github_username: string }> {
    const { data: tokenRow } = await supabaseAdmin
      .from("user_github_tokens")
      .select("access_token, github_username")
      .eq("user_id", userId)
      .single();
    if (!tokenRow) throw new AppError("GitHub not connected. Connect GitHub first.", HTTP_STATUS.BAD_REQUEST);

    const { access_token, github_username } = tokenRow as { access_token: string; github_username: string };
    const headers = { Authorization: `Bearer ${access_token}`, "User-Agent": "PathwayIQ" };

    // Fetch up to 100 public repos sorted by recently updated
    const reposResp = await axios.get("https://api.github.com/user/repos", {
      headers,
      params: { per_page: 100, sort: "updated", visibility: "public" },
    });
    const repos: Array<{ full_name: string }> = reposResp.data;

    // Aggregate language bytes across first 30 repos to stay within GitHub rate limits
    const langBytes: Record<string, number> = {};
    await Promise.all(
      repos.slice(0, 30).map(async (repo) => {
        try {
          const langResp = await axios.get(`https://api.github.com/repos/${repo.full_name}/languages`, { headers });
          for (const [lang, bytes] of Object.entries(langResp.data as Record<string, number>)) {
            langBytes[lang] = (langBytes[lang] ?? 0) + bytes;
          }
        } catch {
          // skip repos that fail (e.g. empty repos)
        }
      })
    );

    const totalBytes = Object.values(langBytes).reduce((sum, b) => sum + b, 0);
    if (totalBytes === 0) return { updated: 0, github_username };

    const langConfidence: Record<string, number> = {};
    for (const [lang, bytes] of Object.entries(langBytes)) {
      langConfidence[lang] = Math.round((bytes / totalBytes) * 10000) / 10000; // 4 decimal places
    }

    // Load user's skills with their master skill name
    const { data: userSkills } = await supabaseAdmin
      .from("user_skills")
      .select("id, skills(name)")
      .eq("user_id", userId);

    let updated = 0;
    const updates: PromiseLike<unknown>[] = [];
    const verifiedForCV: Array<{ skill: string; verified: boolean; confidence: number; evidence_url: string }> = [];

    for (const us of userSkills ?? []) {
      const skillName = (us.skills as unknown as { name: string } | null)?.name;
      if (!skillName) continue;

      // Find GitHub language that maps to this skill name
      const matchedLang = Object.entries(LANG_TO_SKILL).find(([, s]) => s === skillName)?.[0]
        ?? (langConfidence[skillName] !== undefined ? skillName : undefined);

      const conf = matchedLang ? langConfidence[matchedLang] : undefined;
      if (conf !== undefined && conf > 0) {
        updates.push(
          supabaseAdmin
            .from("user_skills")
            .update({ github_verified: true, confidence_score: conf })
            .eq("id", us.id)
        );
        verifiedForCV.push({
          skill: skillName,
          verified: true,
          confidence: conf,
          evidence_url: `https://github.com/${github_username}`,
        });
        updated++;
      }
    }

    await Promise.all(updates);

    // Sync github_verified_skills onto all CVs belonging to this user
    if (verifiedForCV.length > 0) {
      await supabaseAdmin
        .from("cvs")
        .update({ github_verified_skills: verifiedForCV })
        .eq("user_id", userId);
    }

    return { updated, github_username };
  },
};
