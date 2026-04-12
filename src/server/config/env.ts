import 'server-only';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']),
  DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
  APP_URL: z.string().url(),
});

export type Env = z.infer<typeof schema>;

export class EnvValidationError extends Error {
  constructor(public readonly details: z.ZodError) {
    super('Invalid environment');
    this.name = 'EnvValidationError';
  }
}

/**
 * Pure function — parses a given env dict and throws on invalid input.
 * Safe to call from tests with arbitrary inputs.
 */
export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    throw new EnvValidationError(parsed.error);
  }
  return parsed.data;
}

/**
 * Module-level constant — parses process.env at import time.
 * Throws EnvValidationError immediately if env is invalid.
 */
export const env: Env = parseEnv();
