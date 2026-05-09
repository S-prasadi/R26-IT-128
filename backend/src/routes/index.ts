import { Router } from "express";
import authRoutes from "./auth.routes";
import userRoutes from "./user.routes";
import roleRoutes from "./role.routes";
import permissionRoutes from "./permission.routes";
import skillRoutes from "./skill.routes";
import progressRoutes from "./progress.routes";
import careerRoutes from "./career.routes";
import cvRoutes from "./cv.routes";
import interviewRoutes from "./interview.routes";
import notificationRoutes from "./notification.routes";
import githubRoutes from "./github.routes";
import { supabaseAdmin } from "../config/supabase";
import { env } from "../config/env";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ success: true, message: "API is healthy" });
});

router.get("/health/supabase", async (_req, res) => {
  console.log("[Health] Checking Supabase connectivity...");
  try {
    const startTime = Date.now();
    const { data, error } = await supabaseAdmin.from("roles").select("id").limit(1);
    const duration = Date.now() - startTime;

    if (error) {
      console.error("[Health] Supabase query failed:", error);
      return res.status(503).json({
        success: false,
        message: "Supabase connection failed",
        error: error.message,
        supabaseUrl: env.supabase.url,
      });
    }

    console.log(`[Health] Supabase connectivity OK (${duration}ms)`);
    res.json({
      success: true,
      message: "Supabase connection successful",
      supabaseUrl: env.supabase.url,
      responseTime: `${duration}ms`,
    });
  } catch (err) {
    console.error("[Health] Supabase connectivity check failed:", err);
    res.status(503).json({
      success: false,
      message: "Supabase health check failed",
      error: err instanceof Error ? err.message : String(err),
      supabaseUrl: env.supabase.url,
    });
  }
});

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/roles", roleRoutes);
router.use("/permissions", permissionRoutes);
router.use("/skills", skillRoutes);
router.use("/progress", progressRoutes);
router.use("/career", careerRoutes);
router.use("/cv", cvRoutes);
router.use("/interviews", interviewRoutes);
router.use("/notifications", notificationRoutes);
router.use("/github", githubRoutes);

export default router;
