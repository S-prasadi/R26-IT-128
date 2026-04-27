import { hashPassword, comparePassword } from "../utils/hash";
import { signToken } from "../utils/jwt";
import { AppError } from "../middlewares/error.middleware";
import { HTTP_STATUS } from "../constants/http";

interface RegisterDto {
  name: string;
  email: string;
  password: string;
}

interface LoginDto {
  email: string;
  password: string;
}

// In-memory store — replace with your DB layer
const users: Array<{ id: string; name: string; email: string; passwordHash: string; role: "admin" | "user" }> = [];

export const authService = {
  async register(dto: RegisterDto) {
    const existing = users.find((u) => u.email === dto.email);
    if (existing) throw new AppError("Email already in use", HTTP_STATUS.CONFLICT);

    const passwordHash = await hashPassword(dto.password);
    const user = {
      id: crypto.randomUUID(),
      name: dto.name,
      email: dto.email,
      passwordHash,
      role: "user" as const,
    };
    users.push(user);

    const token = signToken({ id: user.id, email: user.email, role: user.role });
    return { token, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
  },

  async login(dto: LoginDto) {
    const user = users.find((u) => u.email === dto.email);
    if (!user) throw new AppError("Invalid credentials", HTTP_STATUS.UNAUTHORIZED);

    const valid = await comparePassword(dto.password, user.passwordHash);
    if (!valid) throw new AppError("Invalid credentials", HTTP_STATUS.UNAUTHORIZED);

    const token = signToken({ id: user.id, email: user.email, role: user.role });
    return { token, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
  },
};
