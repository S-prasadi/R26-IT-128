import axios from "axios";
import { env } from "@/config/env";

const apiClient = axios.create({
  baseURL: env.apiBaseUrl,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

apiClient.interceptors.request.use((config) => {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      // Session expired: clear stale auth so the dashboard layout (which only
      // checks token presence) doesn't keep rendering with a dead token.
      localStorage.removeItem("token");
      localStorage.removeItem("refresh_token");
      localStorage.removeItem("piq-user");
      const onAuthPage = /^\/(login|admin|register)/.test(window.location.pathname);
      if (!onAuthPage) window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default apiClient;
