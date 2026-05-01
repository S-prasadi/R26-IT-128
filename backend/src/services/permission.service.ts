import { supabaseAdmin } from "../config/supabase";
import { AppError } from "../middlewares/error.middleware";
import { HTTP_STATUS } from "../constants/http";
import type { CreatePermissionDto } from "../validations/role.validation";

const PERM_COLS = "id, name, description, resource, action, created_at";

export const permissionService = {
  async list() {
    const { data, error } = await supabaseAdmin
      .from("permissions")
      .select(PERM_COLS)
      .order("resource", { ascending: true })
      .order("action", { ascending: true });
    if (error) throw new AppError(error.message, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    return data ?? [];
  },

  async create(dto: CreatePermissionDto) {
    const { data, error } = await supabaseAdmin
      .from("permissions")
      .insert(dto)
      .select(PERM_COLS)
      .single();
    if (error) {
      if (error.code === "23505") {
        throw new AppError("Permission name already exists", HTTP_STATUS.CONFLICT);
      }
      throw new AppError(error.message, HTTP_STATUS.BAD_REQUEST);
    }
    return data;
  },
};
