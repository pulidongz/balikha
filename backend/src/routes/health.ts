import { Hono } from "hono";
import { pool } from "../db/index.js";

const health = new Hono();

health.get("/", async (c) => {
  let dbStatus: "connected" | "disconnected" = "disconnected";
  let dbError: string | undefined;

  try {
    await pool.query("SELECT 1");
    dbStatus = "connected";
  } catch (err) {
    dbError = err instanceof Error ? err.message : "Unknown error";
  }

  const status = {
    status: "ok",
    db: dbStatus,
    ...(dbError && { dbError }),
    timestamp: new Date().toISOString(),
  };

  return c.json(status);
});

export default health;
