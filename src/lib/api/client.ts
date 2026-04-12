export class ApiFetchError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiFetchError';
  }
}

export async function clientFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: {
      accept: 'application/json',
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({
      error: `HTTP ${response.status}`,
    }));
    throw new ApiFetchError(
      response.status,
      body.error ?? `HTTP ${response.status}`,
      body.code,
      body.requestId,
    );
  }

  return response.json() as Promise<T>;
}
