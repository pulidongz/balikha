// Shared between the server action's validator and the client form's
// character counter. Lives outside the 'use server' module because those
// may only export async functions.
export const COMMENT_MAX_LENGTH = 1000;
