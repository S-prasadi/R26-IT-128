import { z } from "zod";

export const updateUserSchema = z.object({
  full_name: z.string().trim().min(1).optional(),
  avatar_url: z.string().url().optional(),
  is_active: z.boolean().optional(),
});

export const assignRoleSchema = z.object({
  role_id: z.string().uuid(),
});

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
});

export type UpdateUserDto = z.infer<typeof updateUserSchema>;
export type AssignRoleDto = z.infer<typeof assignRoleSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
