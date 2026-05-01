// Discriminated Result type for server actions. Forces every action to
// surface its failure modes explicitly and every form to render them
// uniformly (switch on `result.ok`).
//
// fieldErrors mirrors Zod's flatten().fieldErrors output so you can pass it
// straight through from `parsed.error.flatten().fieldErrors`.
export type Result<T, E = string> =
  | { ok: true; data: T }
  | { ok: false; error: E; fieldErrors?: Record<string, string[]> };

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function err<E = string>(
  error: E,
  fieldErrors?: Record<string, string[]>,
): Result<never, E> {
  return { ok: false, error, fieldErrors };
}
