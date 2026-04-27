import dotenv from "dotenv";
dotenv.config();

export const env = {
  nodeEnv: process.env["NODE_ENV"] ?? "development",
  port: parseInt(process.env["PORT"] ?? "8080", 10),

  jwt: {
    secret: process.env["JWT_SECRET"] ?? "dev_secret",
    expiresIn: process.env["JWT_EXPIRES_IN"] ?? "7d",
  },

  corsOrigin: process.env["CORS_ORIGIN"] ?? "http://localhost:3000",
} as const;
