import dotenv from "dotenv";
dotenv.config();

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

export const env = {
  nodeEnv: process.env["NODE_ENV"] ?? "development",
  port: parseInt(process.env["PORT"] ?? "8080", 10),

  corsOrigin: process.env["CORS_ORIGIN"] ?? "http://localhost:3000",

  supabase: {
    url: required("SUPABASE_URL"),
    anonKey: required("SUPABASE_ANON_KEY"),
    serviceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
    jwtIssuer: required("SUPABASE_JWT_ISSUER"),
    jwksUrl: required("SUPABASE_JWKS_URL"),
    jwtAudience: process.env["SUPABASE_JWT_AUDIENCE"] ?? "authenticated",
  },

  adminSetupKey: process.env["ADMIN_SETUP_KEY"] ?? "",

  frontendUrl: process.env["FRONTEND_URL"] ?? "http://localhost:3000",

  github: {
    clientId:     process.env["GITHUB_CLIENT_ID"] ?? "",
    clientSecret: process.env["GITHUB_CLIENT_SECRET"] ?? "",
    redirectUri:  process.env["GITHUB_OAUTH_REDIRECT_URI"] ?? "http://localhost:8081/api/github/callback",
  },

  python: {
    moduleAUrl: process.env["PYTHON_MODULE_A_URL"] ?? "http://localhost:8001",
    moduleBUrl: process.env["PYTHON_MODULE_B_URL"] ?? "http://localhost:8002",
    moduleCUrl: process.env["PYTHON_MODULE_C_URL"] ?? "http://localhost:8003",
    moduleDUrl: process.env["PYTHON_MODULE_D_URL"] ?? "http://localhost:8004",
  },
} as const;
