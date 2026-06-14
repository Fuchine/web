// Error model (CONTRATO_IA §7). Principle: AI failure degrades, never breaks.
// A video without translation is still studyable; a line without an
// explanation still plays and still enters the SRS.

export class LlmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Self-host without a BYOK key configured. Layer 0 keeps working. */
export class MissingApiKeyError extends LlmError {}

/** Provider down, or invalid response after retry. */
export class ProviderError extends LlmError {}

/** Provider rate-limited the request. Back off and retry. */
export class RateLimitError extends LlmError {}

/** Cloud only: user exceeded their plan quota. Never happens in self-host. */
export class QuotaExceededError extends LlmError {}
