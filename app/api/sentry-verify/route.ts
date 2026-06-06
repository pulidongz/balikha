// Temporary endpoint that deliberately throws so an operator can confirm the
// production error-tracking pipeline end to end (Sentry capture, readable
// stack via source maps, and the requestId tag matching the Pino logs).
// Remove once verified — it is not part of the application surface.
export function GET() {
  throw new Error('Sentry pipeline verification: deliberate test error');
}
