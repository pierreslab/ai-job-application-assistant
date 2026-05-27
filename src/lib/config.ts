/**
 * Gemini configuration for the public app.
 *
 * Users provide their own API key in the browser. Do not commit API keys here.
 */
export const GEMINI_TEXT_MODEL = "gemini-3-flash-preview";
export const GEMINI_SEARCH_MODEL = "gemini-3-flash-preview";

/** Returns the user-provided Gemini key after basic cleanup. */
export function nextGeminiKey(preferredKey?: string): string {
  return preferredKey?.trim() ?? "";
}

/** True if the error message looks like a quota / auth / rate-limit problem worth retrying. */
export function isRetriableKeyError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /\b(429|quota|rate.?limit|RESOURCE_EXHAUSTED|401|403|API[_ ]key|invalid.+key|PERMISSION_DENIED|UNAUTHENTICATED)\b/i.test(msg);
}
