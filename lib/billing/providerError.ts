/**
 * A payment provider could not be reached, or answered with something other
 * than a verdict. Shared base so every caller that must treat an outage as
 * "we don't know" (sync, webhooks, reconciliation, the admin resync) can do
 * it once, whichever provider failed.
 */
export class BillingProviderError extends Error {
  constructor(
    message: string,
    /** HTTP status, or 0 when the request never completed. A 0 or 5xx is an outage, not a cancellation. */
    public status: number,
  ) {
    super(message)
  }
}
