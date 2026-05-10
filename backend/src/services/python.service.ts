import axios, { AxiosError } from "axios";
import { env } from "../config/env";

export async function callPython(
  url: string,
  body: object,
  fallback: object
): Promise<object> {
  try {
    const response = await axios.post(url, body, { timeout: 60000 });
    return response.data;
  } catch (err) {
    const axiosErr = err as AxiosError;
    // Service returned an HTTP error (4xx/5xx) — propagate it so the caller sees the real reason
    if (axiosErr.response) {
      const detail = (axiosErr.response.data as any)?.detail ?? axiosErr.message;
      console.error(`[Python] ${url} responded ${axiosErr.response.status}: ${detail}`);
      throw new Error(`Python service error (${axiosErr.response.status}): ${detail}`);
    }
    // Service is unreachable (network error / timeout) — use mock fallback
    console.warn(`[Python] Service unreachable at ${url} — using mock fallback`);
    return fallback;
  }
}

export const pythonUrls = {
  moduleA: () => env.python.moduleAUrl,
  moduleB: () => env.python.moduleBUrl,
  moduleC: () => env.python.moduleCUrl,
  moduleD: () => env.python.moduleDUrl,
};
