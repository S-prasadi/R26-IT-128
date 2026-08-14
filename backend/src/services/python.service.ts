import axios, { AxiosError } from "axios";
import { env } from "../config/env";

// Thrown when a Python service can't be reached (network error / timeout) and the
// caller asked us NOT to silently substitute a fallback — lets the caller surface
// a real "model offline" state instead of returning fake data.
export class PythonUnavailableError extends Error {
  constructor(public url: string) {
    super(`Python service unreachable at ${url}`);
    this.name = "PythonUnavailableError";
  }
}

export async function callPython(
  url: string,
  body: object,
  fallback: object,
  opts?: { throwOnUnreachable?: boolean; timeoutMs?: number }
): Promise<object> {
  try {
    const response = await axios.post(url, body, { timeout: opts?.timeoutMs ?? 60000 });
    return response.data;
  } catch (err) {
    const axiosErr = err as AxiosError;
    // Service returned an HTTP error (4xx/5xx) — propagate it so the caller sees the real reason
    if (axiosErr.response) {
      // Flask returns { error: "..." }, FastAPI returns { detail: "..." }
      const data = axiosErr.response.data as any;
      const detail = data?.detail ?? data?.error ?? axiosErr.message;
      console.error(`[Python] ${url} responded ${axiosErr.response.status}: ${detail}`);
      throw new Error(`Python service error (${axiosErr.response.status}): ${detail}`);
    }
    // Service is unreachable (network error / timeout).
    if (opts?.throwOnUnreachable) {
      console.error(`[Python] Service unreachable at ${url} — surfacing offline error`);
      throw new PythonUnavailableError(url);
    }
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
