import { supabaseAdmin } from "../config/supabase";
import { AppError } from "../middlewares/error.middleware";
import { HTTP_STATUS } from "../constants/http";
import type {
  CreateRoleDto,
  UpdateRoleDto,
} from "../validations/role.validation";

const ROLE_COLS = "id, name, description, is_system, created_at";

export const roleService = {
  async list() {
    const { data, error } = await supabaseAdmin
      .from("roles")
      .select(`${ROLE_COLS}, role_permissions(permissions(name))`)
      .order("name", { ascending: true });
    if (error) throw new AppError(error.message, HTTP_STATUS.INTERNAL_SERVER_ERROR);

    return (data ?? []).map((r) => ({
      ...r,
      permissions: (((r.role_permissions as unknown) as { permissions?: { name?: string } | null }[]) ?? [])
        .map((rp) => rp.permissions?.name)
        .filter(Boolean) as string[],
      role_permissions: undefined,
    }));
  },

  async findById(id: string) {
    const { data, error } = await supabaseAdmin
      .from("roles")
      .select(ROLE_COLS)
      .eq("id", id)
      .single();
    if (error) throw new AppError("Role not found", HTTP_STATUS.NOT_FOUND);

    const { data: perms } = await supabaseAdmin
      .from("role_permissions")
      .select("permissions(id, name, description, resource, action)")
      .eq("role_id", id);

    const permissions = (perms ?? [])
      .map((row: { permissions: unknown }) => row.permissions)
      .filter(Boolean);

    return { ...data, permissions };
  },

  async create(dto: CreateRoleDto) {
    const { data, error } = await supabaseAdmin
      .from("roles")
      .insert({ name: dto.name, description: dto.description, is_system: false })
      .select(ROLE_COLS)
      .single();
    if (error) {
      if (error.code === "23505") {
        throw new AppError("Role name already exists", HTTP_STATUS.CONFLICT);
      }
      throw new AppError(error.message, HTTP_STATUS.BAD_REQUEST);
    }
    return data;
  },

  async update(id: string, dto: UpdateRoleDto) {
    const existing = await roleService.findById(id);
    if (existing.is_system) {
      throw new AppError("System roles cannot be modified", HTTP_STATUS.FORBIDDEN);
    }

    const { data, error } = await supabaseAdmin
      .from("roles")
      .update(dto)
      .eq("id", id)
      .select(ROLE_COLS)
      .single();
    if (error) throw new AppError(error.message, HTTP_STATUS.BAD_REQUEST);
    return data;
  },

  async remove(id: string) {
    const existing = await roleService.findById(id);
    if (existing.is_system) {
      throw new AppError("System roles cannot be deleted", HTTP_STATUS.FORBIDDEN);
    }
    const { error } = await supabaseAdmin.from("roles").delete().eq("id", id);
    if (error) throw new AppError(error.message, HTTP_STATUS.BAD_REQUEST);
    return { success: true };
  },

  async attachPermission(roleId: string, permissionId: string) {
    const { error } = await supabaseAdmin
      .from("role_permissions")
      .insert({ role_id: roleId, permission_id: permissionId });
    if (error) {
      if (error.code === "23505") {
        throw new AppError("Permission already attached", HTTP_STATUS.CONFLICT);
      }
      throw new AppError(error.message, HTTP_STATUS.BAD_REQUEST);
    }
    return { success: true };
  },

  async detachPermission(roleId: string, permissionId: string) {
    const { error } = await supabaseAdmin
      .from("role_permissions")
      .delete()
      .eq("role_id", roleId)
      .eq("permission_id", permissionId);
    if (error) throw new AppError(error.message, HTTP_STATUS.BAD_REQUEST);
    return { success: true };
  },
};
