import { supabaseAdmin } from "../config/supabase";
import { AppError } from "../middlewares/error.middleware";
import { HTTP_STATUS } from "../constants/http";
import type { UpdateUserDto, ListUsersQuery } from "../validations/user.validation";

const PROFILE_COLS =
  "id, email, full_name, avatar_url, is_active, created_at, updated_at";

export const userService = {
  async findById(id: string) {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select(PROFILE_COLS)
      .eq("id", id)
      .single();
    if (error) throw new AppError("User not found", HTTP_STATUS.NOT_FOUND);

    const { data: rp } = await supabaseAdmin
      .from("v_user_permissions")
      .select("role_id, role_name, permission_name")
      .eq("user_id", id);

    const rolesMap = new Map<string, string>();
    const permissions = new Set<string>();
    for (const row of rp ?? []) {
      rolesMap.set(row.role_id as string, row.role_name as string);
      permissions.add(row.permission_name as string);
    }

    return {
      ...data,
      roles: Array.from(rolesMap, ([id, name]) => ({ id, name })),
      permissions: Array.from(permissions),
    };
  },

  async findAll(query: ListUsersQuery) {
    const from = (query.page - 1) * query.limit;
    const to = from + query.limit - 1;

    let q = supabaseAdmin
      .from("profiles")
      .select(PROFILE_COLS, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (query.search) {
      q = q.or(`email.ilike.%${query.search}%,full_name.ilike.%${query.search}%`);
    }

    const { data, error, count } = await q;
    if (error) throw new AppError(error.message, HTTP_STATUS.INTERNAL_SERVER_ERROR);

    return {
      items: data ?? [],
      page: query.page,
      limit: query.limit,
      total: count ?? 0,
    };
  },

  async update(id: string, dto: UpdateUserDto) {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .update(dto)
      .eq("id", id)
      .select(PROFILE_COLS)
      .single();
    if (error) throw new AppError(error.message, HTTP_STATUS.BAD_REQUEST);
    return data;
  },

  /** Soft-delete: deactivate the profile. */
  async deactivate(id: string) {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .update({ is_active: false })
      .eq("id", id)
      .select(PROFILE_COLS)
      .single();
    if (error) throw new AppError(error.message, HTTP_STATUS.BAD_REQUEST);
    return data;
  },

  /** Hard-delete: removes from auth.users; cascades to profiles. */
  async hardDelete(id: string) {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(id);
    if (error) throw new AppError(error.message, HTTP_STATUS.BAD_REQUEST);
    return { success: true };
  },

  async assignRole(userId: string, roleId: string, assignedBy: string) {
    const { error } = await supabaseAdmin.from("user_roles").insert({
      user_id: userId,
      role_id: roleId,
      assigned_by: assignedBy,
    });
    if (error) {
      if (error.code === "23505") {
        throw new AppError("User already has this role", HTTP_STATUS.CONFLICT);
      }
      throw new AppError(error.message, HTTP_STATUS.BAD_REQUEST);
    }
    return { success: true };
  },

  async removeRole(userId: string, roleId: string) {
    const { error } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", userId)
      .eq("role_id", roleId);
    if (error) throw new AppError(error.message, HTTP_STATUS.BAD_REQUEST);
    return { success: true };
  },
};
