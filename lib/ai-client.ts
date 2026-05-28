import OpenAI from "openai";

/**
 * Provider-agnostic AI client — switch providers by changing three .env vars,
 * zero code changes required.
 *
 * ── Phase 1 (free) ───────────────────────────────────────────────────────────
 * AI_PROVIDER=gemini
 * AI_API_KEY=AIza...          ← aistudio.google.com → Get API Key
 * AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
 * AI_MODEL=gemini-2.5-flash
 *
 * ── Phase 2 (cheap paid) ─────────────────────────────────────────────────────
 * AI_PROVIDER=deepseek
 * AI_API_KEY=sk-...           ← platform.deepseek.com
 * AI_BASE_URL=https://api.deepseek.com
 * AI_MODEL=deepseek-chat
 *
 * ── Phase 3 (best Khmer) ─────────────────────────────────────────────────────
 * AI_PROVIDER=claude
 * AI_API_KEY=sk-ant-...       ← console.anthropic.com
 * AI_BASE_URL=https://api.anthropic.com/v1
 * AI_MODEL=claude-haiku-4-5
 */

const provider = process.env.AI_PROVIDER ?? "gemini";

export const aiClient = new OpenAI({
  apiKey:  process.env.AI_API_KEY ?? "no-key",
  baseURL: process.env.AI_BASE_URL ?? undefined,
  // Claude's OpenAI-compatible endpoint requires this extra header
  ...(provider === "claude" && {
    defaultHeaders: {
      "anthropic-version": "2023-06-01",
      "x-api-key": process.env.AI_API_KEY ?? "",
    },
  }),
});

export const AI_MODEL    = process.env.AI_MODEL    ?? "gemini-2.5-flash";
export const AI_PROVIDER = provider;

/** True when a real API key is configured */
export const AI_ENABLED  = !!(
  process.env.AI_API_KEY &&
  process.env.AI_API_KEY !== "no-key" &&
  process.env.AI_API_KEY.length > 8
);
