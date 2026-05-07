import axios from "axios";
import { env } from "../config/env";

export async function callPython(
  url: string,
  body: object,
  fallback: object
): Promise<object> {
  try {
    const response = await axios.post(url, body, { timeout: 10000 });
    return response.data;
  } catch (err) {
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
