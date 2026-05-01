import { z } from "zod";

export const createRoleSchema = z.object({
  name: z.string().trim().min(1).max(64),
  description: z.string().trim().optional(),
});

export const updateRoleSchema = z.object({
  name: z.string().trim().min(1).max(64).optional(),
  description: z.string().trim().optional(),
});

export const attachPermissionSchema = z.object({
  permission_id: z.string().uuid(),
});

export const createPermissionSchema = z.object({
  name: z.string().trim().min(1).max(128),
  description: z.string().trim().optional(),
  resource: z.string().trim().min(1).max(64),
  action: z.string().trim().min(1).max(64),
});

export type CreateRoleDto = z.infer<typeof createRoleSchema>;
export type UpdateRoleDto = z.infer<typeof updateRoleSchema>;
export type AttachPermissionDto = z.infer<typeof attachPermissionSchema>;
export type CreatePermissionDto = z.infer<typeof createPermissionSchema>;
