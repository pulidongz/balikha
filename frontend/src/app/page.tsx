import HealthCheck from "./components/HealthCheck";

interface HealthResponse {
  status: string;
  db: string;
  dbError?: string;
  timestamp: string;
}

export default async function Home() {
  const apiUrl = process.env.API_URL ?? "http://backend:8787";
  let health: HealthResponse | null = null;
  let fetchError: string | null = null;

  try {
    const res = await fetch(`${apiUrl}/api/health`, {
      cache: "no-store",
    });
    health = (await res.json()) as HealthResponse;
  } catch (err) {
    fetchError = err instanceof Error ? err.message : "Failed to reach backend";
  }

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-2xl flex-col items-center justify-center gap-8 py-16 px-8">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Balikha
        </h1>
        <p className="text-lg text-zinc-500 dark:text-zinc-400">
          Artisan marketplace — handcrafted pottery and more
        </p>

        <div className="w-full rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-400">
            Server-Side Health (SSR)
          </h2>
          {health ? (
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
            <p className="text-sm text-red-500">Backend unreachable: {fetchError}</p>
          )}
        </div>

        <HealthCheck />
      </main>
    </div>
  );
}
