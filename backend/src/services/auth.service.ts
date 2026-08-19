import { supabaseAdmin, supabaseAnon } from "../config/supabase";
import { AppError } from "../middlewares/error.middleware";
import { HTTP_STATUS } from "../constants/http";
import { env } from "../config/env";
import type {
  RegisterDto,
  LoginDto,
  RefreshDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from "../validations/auth.validation";

// Every new auth.users row gets the default 'user' role from the
// handle_new_user() DB trigger, including admin/manager accounts created via
// seedAdmin() — so an admin's `roles` array is really ['user', 'admin'], and
// picking roles[0] picks whichever the DB happens to return first, not the
// most-privileged one. This ranks by privilege instead, so a dual-role admin
// is reported as "admin", not arbitrarily as "user" (which previously locked
// admins out of the admin-only login page's role check).
const ROLE_PRIORITY = ["admin", "manager", "user"];
function primaryRole(roles: string[]): string {
  for (const r of ROLE_PRIORITY) if (roles.includes(r)) return r;
  return roles[0] ?? "user";
}

export const authService = {
  async register(dto: RegisterDto) {
    console.log(`[Auth] Register attempt for email: ${dto.email}`);
    console.log(`[Auth] Connecting to Supabase at: ${env.supabase.url}`);

    // Use admin API so no confirmation email is sent (avoids Supabase free-tier
    // 2 emails/hr rate limit). User is immediately confirmed and can log in.
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: dto.email,
      password: dto.password,
      email_confirm: true,
      user_metadata: dto.full_name ? { full_name: dto.full_name } : undefined,
    });
    if (error) {
      console.error(`[Auth] Register failed for ${dto.email}:`, error);
      const status = error.message.toLowerCase().includes("already registered")
        ? HTTP_STATUS.CONFLICT
        : HTTP_STATUS.BAD_REQUEST;
      throw new AppError(error.message, status);
    }

    console.log(`[Auth] User created successfully for ${dto.email}`);

    // Sign in immediately to return a session alongside the new user
    const { data: session, error: signInErr } = await supabaseAnon.auth.signInWithPassword({
      email: dto.email,
      password: dto.password,
    });
    if (signInErr) {
      console.error(`[Auth] Sign-in after register failed for ${dto.email}:`, signInErr);
      throw new AppError(signInErr.message, HTTP_STATUS.BAD_REQUEST);
    }

    console.log(`[Auth] Register and sign-in successful for ${dto.email}`);

    const { data: rp2 } = await supabaseAdmin
      .from("v_user_permissions")
      .select("role_name, permission_name")
      .eq("user_id", data.user.id);

    const roles2 = Array.from(new Set((rp2 ?? []).map((r) => r.role_name as string)));
    const perms2 = Array.from(new Set((rp2 ?? []).map((r) => r.permission_name as string)));

    return {
      user: {
        id: data.user.id,
        email: data.user.email ?? "",
        name: dto.full_name ?? data.user.email ?? "",
        role: primaryRole(roles2),
        roles: roles2,
        permissions: perms2,
        is_active: true,
      },
      session: session.session,
    };
  },

  async login(dto: LoginDto) {
    console.log(`[Auth] Login attempt for email: ${dto.email}`);
    console.log(`[Auth] Connecting to Supabase at: ${env.supabase.url}`);

    const { data, error } = await supabaseAnon.auth.signInWithPassword({
      email: dto.email,
      password: dto.password,
    });

    if (error) {
      console.error(`[Auth] Login failed for ${dto.email}:`, error);
      throw new AppError(error.message, HTTP_STATUS.UNAUTHORIZED);
    }

    console.log(`[Auth] Login successful for ${dto.email}`);

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name, is_active")
      .eq("id", data.user.id)
      .single();

    const { data: rp } = await supabaseAdmin
      .from("v_user_permissions")
      .select("role_name, permission_name")
      .eq("user_id", data.user.id);

    const roles = Array.from(new Set((rp ?? []).map((r) => r.role_name as string)));
    const permissions = Array.from(new Set((rp ?? []).map((r) => r.permission_name as string)));

    return {
      user: {
        id: data.user.id,
        email: profile?.email ?? data.user.email ?? "",
        name: profile?.full_name ?? (data.user.user_metadata?.full_name as string | undefined) ?? data.user.email ?? "",
        role: primaryRole(roles),
        roles,
        permissions,
        is_active: profile?.is_active ?? true,
      },
      session: data.session,
    };
  },

  async refresh(dto: RefreshDto) {
    console.log("[Auth] Refresh token attempt");
    const { data, error } = await supabaseAnon.auth.refreshSession({
      refresh_token: dto.refresh_token,
    });
    if (error) {
      console.error("[Auth] Refresh token failed:", error);
      throw new AppError(error.message, HTTP_STATUS.UNAUTHORIZED);
    }
    console.log("[Auth] Refresh token successful");
    return {
      user: data.user,
      session: data.session,
    };
  },

  async logout(accessToken: string) {
    // POST directly to Supabase's /logout endpoint with the user's own JWT.
    // admin.signOut() targets multi-device revocation and errors when the
    // session is already gone; this is the correct single-session revocation.
    const response = await fetch(`${env.supabase.url}/auth/v1/logout?scope=local`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: env.supabase.anonKey,
      },
    });

    // Any non-ok response: check if it just means the session is already gone.
    // If so, treat as success — logout is idempotent.
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const msg: string = ((body as { msg?: string; message?: string }).msg
        ?? (body as { msg?: string; message?: string }).message
        ?? "").toLowerCase();
      const alreadyGone =
        msg.includes("session") ||
        msg.includes("missing") ||
        msg.includes("not exist") ||
        response.status === 401 ||
        response.status === 404;
      if (!alreadyGone) {
        throw new AppError(msg || "Logout failed", HTTP_STATUS.BAD_REQUEST);
      }
    }

    return { success: true };
  },

  async forgotPassword(dto: ForgotPasswordDto) {
    const { error } = await supabaseAnon.auth.resetPasswordForEmail(dto.email, {
      redirectTo: dto.redirect_to,
    });
    if (error) throw new AppError(error.message, HTTP_STATUS.BAD_REQUEST);
    return { success: true };
  },

  /**
   * Reset password for the currently-authenticated user.
   * Caller must already be authenticated via the auth middleware,
   * so we update via admin API using their user id.
   */
  async resetPassword(userId: string, dto: ResetPasswordDto) {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: dto.password,
    });
    if (error) throw new AppError(error.message, HTTP_STATUS.BAD_REQUEST);
    return { success: true };
  },

  async seedAdmin(dto: { full_name: string; email: string; password: string }, setupKey: string) {
    if (!env.adminSetupKey || setupKey !== env.adminSetupKey) {
      throw new AppError("Invalid setup key", HTTP_STATUS.FORBIDDEN);
    }

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: dto.email,
      password: dto.password,
      email_confirm: true,
      user_metadata: { full_name: dto.full_name },
    });
    if (error) throw new AppError(error.message, HTTP_STATUS.BAD_REQUEST);

    const { data: adminRole, error: rErr } = await supabaseAdmin
      .from("roles")
      .select("id")
      .eq("name", "admin")
      .single();
    if (rErr || !adminRole) throw new AppError("admin role not found in DB", HTTP_STATUS.INTERNAL_SERVER_ERROR);

    const { error: urErr } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: data.user.id, role_id: adminRole.id }, { onConflict: "user_id,role_id" });
    if (urErr) throw new AppError(urErr.message, HTTP_STATUS.INTERNAL_SERVER_ERROR);

    return { id: data.user.id, email: dto.email, name: dto.full_name, role: "admin" };
  },

  async getMe(userId: string) {
    const { data: profile, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name, avatar_url, is_active, created_at, updated_at")
      .eq("id", userId)
      .single();
    if (pErr) throw new AppError(pErr.message, HTTP_STATUS.NOT_FOUND);

    const { data: rp } = await supabaseAdmin
      .from("v_user_permissions")
      .select("role_name, permission_name")
      .eq("user_id", userId);

    const roles = Array.from(new Set((rp ?? []).map((r) => r.role_name as string)));
    const permissions = Array.from(
      new Set((rp ?? []).map((r) => r.permission_name as string))
    );

    return { ...profile, roles, permissions };
  },
};
