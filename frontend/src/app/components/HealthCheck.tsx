"use client";

import { useEffect, useState } from "react";

interface HealthResponse {
  status: string;
  db: string;
  dbError?: string;
  timestamp: string;
}

export default function HealthCheck() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/health")
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return res.json() as Promise<HealthResponse>;
      })
      .then(setHealth)
      .catch((err) => setError(err instanceof Error ? err.message : "Unknown error"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="w-full rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-400">
        Client-Side Health (Rewrites Proxy)
      </h2>
      {loading ? (
        <p className="text-sm text-zinc-400">Checking...</p>
      ) : health ? (
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-zinc-500">Backend</span>
            <span className="font-mono text-green-600">{health.status}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Database</span>
            <span
              className={`font-mono ${health.db === "connected" ? "text-green-600" : "text-red-500"}`}
            >
              {health.db}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Timestamp</span>
            <span className="font-mono text-zinc-600 dark:text-zinc-300">
              {health.timestamp}
            </span>
          </div>
        </div>
      ) : (
        <p className="text-sm text-red-500">Proxy unreachable: {error}</p>
      )}
    </div>
  );
}
