// postgres-js reports the affected-row count for writes as `.count`
// (see node_modules/postgres/types/index.d.ts ResultMeta). It does NOT
// set `.rowCount` — that's node-postgres's field, which reads as
// `undefined` here and silently disables any `rowCount === 0` check.
// Drizzle passes the raw postgres-js result through for writes without
// `.returning()`, so read `.count`.
export function affectedRows(result: unknown): number {
  const count = (result as { count?: number }).count;
  if (typeof count !== 'number') {
    throw new Error('affectedRows: expected a postgres-js write result with a numeric `count`');
  }
  return count;
}
