export const env = {
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080/api",
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? "PathwayIQ",
} as const;
