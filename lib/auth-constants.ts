// Single source of truth for the email/password credential length bounds.
// Imported by BOTH the Better Auth config (emailAndPassword.minPasswordLength /
// maxPasswordLength) and the change/set-password validators, so the client form
// and the server endpoint can never disagree on what counts as valid. These are
// Better Auth's own defaults (8 / 128) made explicit and shared — change them in
// one place and both the schema and the API move together.
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;
