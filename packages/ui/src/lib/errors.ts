/**
 * An error whose message is written for the end user and should be shown as
 * is (e.g. "Add your own API key in Settings…"), instead of a generic fallback.
 * `blocking` = the condition applies to every line, not just this one (daily
 * budget spent, no key), so the player stops asking until the user retries.
 */
export class UserFacingError extends Error {
  constructor(message: string, readonly blocking = false) {
    super(message);
    this.name = "UserFacingError";
  }
}
