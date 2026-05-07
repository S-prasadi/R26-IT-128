import app from "../src/app";
import { env } from "../src/config/env";

if (!process.env["VERCEL"]) {
  app.listen(env.port, () => {
    console.log(`API server listening on port ${env.port}`);
  });
}

// Vercel exports the Express app as a serverless function.
// The `api/index.ts` file is the single entry point Vercel invokes.
export default app;
