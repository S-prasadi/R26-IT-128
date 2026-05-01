export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  is_active?: boolean;
  created_at?: string;
  full_name?: string;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  is_system: boolean;
  permissions: string[];
  created_at?: string;
}

export interface ApiResponse<T> {
  data: T;
  message: string;
  success: boolean;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  limit: number;
}
