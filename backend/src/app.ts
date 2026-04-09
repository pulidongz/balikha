import { Hono } from "hono";
import { cors } from "hono/cors";
import health from "./routes/health.js";

export function createApp() {
  const app = new Hono();

  const corsOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:3000")
    .split(",")
    .map((o) => o.trim());

  app.use(
    "*",
    cors({
      origin: corsOrigins,
      credentials: true,
    }),
  );

  app.route("/api/health", health);

  app.get("/", (c) => {
    return c.json({ name: "balikha-backend", version: "0.1.0" });
  });

  return app;
}
