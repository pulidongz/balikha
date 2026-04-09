import { describe, it, expect, vi, beforeEach } from "vitest";
import { createApp } from "../app.js";

vi.mock("../db/index.js", () => ({
  pool: {
    query: vi.fn(),
  },
  db: {},
}));

import { pool } from "../db/index.js";

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns connected status when database is reachable", async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ "?column?": 1 }] } as never);

    const app = createApp();
    const res = await app.request("/api/health");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      status: "ok",
      db: "connected",
    });
    expect(body.timestamp).toBeDefined();
    expect(pool.query).toHaveBeenCalledWith("SELECT 1");
  });

  it("returns disconnected status when database query fails", async () => {
    vi.mocked(pool.query).mockRejectedValueOnce(new Error("Connection refused"));

    const app = createApp();
    const res = await app.request("/api/health");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      status: "ok",
      db: "disconnected",
      dbError: "Connection refused",
    });
  });
});
