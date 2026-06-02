/**
 * Converts an AI API error into a user-friendly message.
 * Catches the 503 "AI not configured" case and surfaces it clearly.
 */
export function friendlyAiError(err: unknown, res?: Response): string {
  if (res?.status === 503) {
    return "AI is not enabled. Configure AI_API_KEY in your environment to use this feature.";
  }
  if (err instanceof Error) {
    if (err.message.toLowerCase().includes("not configured") ||
        err.message.toLowerCase().includes("not enabled")) {
      return "AI is not enabled. Configure AI_API_KEY in your environment to use this feature.";
    }
    return err.message;
  }
  return "An unexpected error occurred.";
}
