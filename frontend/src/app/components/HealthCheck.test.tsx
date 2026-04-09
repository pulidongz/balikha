import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import HealthCheck from "./HealthCheck";

describe("<HealthCheck />", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("displays connected status when backend responds with healthy DB", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: "ok",
          db: "connected",
          timestamp: "2026-04-09T00:00:00.000Z",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(<HealthCheck />);

    expect(screen.getByText("Checking...")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("connected")).toBeInTheDocument();
    });

    expect(screen.getByText("ok")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith("/api/health");
  });

  it("displays error message when fetch fails", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new Error("Network error"));

    render(<HealthCheck />);

    await waitFor(() => {
      expect(screen.getByText(/Proxy unreachable/)).toBeInTheDocument();
    });

    expect(screen.getByText(/Network error/)).toBeInTheDocument();
  });

  it("displays disconnected DB status when backend reports disconnected", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: "ok",
          db: "disconnected",
          dbError: "Connection refused",
          timestamp: "2026-04-09T00:00:00.000Z",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(<HealthCheck />);

    await waitFor(() => {
      expect(screen.getByText("disconnected")).toBeInTheDocument();
    });
  });
});
