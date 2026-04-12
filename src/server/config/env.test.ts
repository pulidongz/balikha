import { describe, it, expect } from 'vitest';
import { parseEnv, EnvValidationError } from './env';

const validEnv = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  AUTH_SECRET: 'test-secret-at-least-32-characters-long-ok',
  APP_URL: 'http://localhost:3000',
};

describe('parseEnv', () => {
  it('returns parsed env for valid input', () => {
    const result = parseEnv(validEnv);
    expect(result.NODE_ENV).toBe('development');
    expect(result.DATABASE_URL).toBe('postgresql://user:pass@localhost:5432/db');
    expect(result.AUTH_SECRET).toBe('test-secret-at-least-32-characters-long-ok');
    expect(result.APP_URL).toBe('http://localhost:3000');
  });

  it('throws EnvValidationError when AUTH_SECRET is missing', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: validEnv.NODE_ENV,
        DATABASE_URL: validEnv.DATABASE_URL,
        APP_URL: validEnv.APP_URL,
      }),
    ).toThrow(EnvValidationError);
  });

  it('throws EnvValidationError when AUTH_SECRET is shorter than 32 characters', () => {
    expect(() => parseEnv({ ...validEnv, AUTH_SECRET: 'short' })).toThrow(EnvValidationError);
  });

  it('throws EnvValidationError when DATABASE_URL is malformed', () => {
    expect(() => parseEnv({ ...validEnv, DATABASE_URL: 'not-a-url' })).toThrow(EnvValidationError);
  });

  it('throws EnvValidationError when NODE_ENV is invalid', () => {
    expect(() => parseEnv({ ...validEnv, NODE_ENV: 'staging' })).toThrow(EnvValidationError);
  });
});
