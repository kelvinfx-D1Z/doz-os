import { GoogleGenerativeAI } from "@google/generative-ai";

// ============================================================
// Gemini-powered DIDI (AI Chief of Staff) helper.
//
// SINGLE SOURCE OF TRUTH for the Gemini model name + client config.
// Every API route that needs AI MUST import from this file — never
// hardcode a model name or instantiate GoogleGenerativeAI directly.
//
// DESIGN PRINCIPLES:
// 1. NEVER throw to the caller. If Gemini fails (network, 404, quota,
//    bad API key, malformed response), we return an empty response
//    object `{ choices: [{ message: { content: "" } }] }`. The caller
//    checks for empty text and returns a graceful fallback. This
//    prevents 500 errors from cascading to the frontend.
// 2. The model name is centralized here so a Google deprecation only
//    requires changing ONE line.
// 3. The response shape mirrors the old ZAI/OpenAI format
//    (`completion.choices[0].message.content`) so call sites don't
//    need their destructuring logic changed.
// ============================================================

// ── Model configuration (single source of truth) ──────────────
// Use `gemini-flash-latest` — this always points to the newest
// Flash model and is immune to individual model deprecations.
// If you need to pin a specific version, change it here ONLY.
export const GEMINI_MODEL = "gemini-flash-latest";

// ── Environment variable ──────────────────────────────────────
// Reads `GOOGLE_API_KEY`. Do NOT use GOOGLE_GENERATIVE_AI_API_KEY
// or any other variation — this is the canonical name.
function getApiKey(): string | null {
  const key = process.env.GOOGLE_API_KEY;
  if (!key || key.length < 10 || key === "your-google-api-key-here") {
    return null;
  }
  return key;
}

// ── Client singleton (cached for the lifetime of the process) ─
let cachedClient: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI | null {
  if (cachedClient) return cachedClient;
  const apiKey = getApiKey();
  if (!apiKey) {
    // Don't throw — log and return null so callers can fall back gracefully.
    console.warn(
      "[Gemini] GOOGLE_API_KEY is not set or is still the placeholder. " +
        "AI features will return empty fallbacks until it's configured. " +
        "Get a key from https://aistudio.google.com/app/apikey",
    );
    return null;
  }
  try {
    cachedClient = new GoogleGenerativeAI(apiKey);
    return cachedClient;
  } catch (err) {
    console.error("[Gemini] Failed to instantiate GoogleGenerativeAI:", err);
    return null;
  }
}

// ── Types ─────────────────────────────────────────────────────
export interface ChatMessage {
  role: "system" | "assistant" | "user";
  content: string;
}

export interface ChatCompletionRequest {
  messages: ChatMessage[];
  /** Accepted for backward compatibility — Gemini ignores it. */
  thinking?: { type: "disabled" | "enabled" };
  /**
   * Optional generation config passthrough. Callers that need to tune
   * temperature / max tokens / stop sequences can set them here.
   */
  generationConfig?: {
    temperature?: number;
    topP?: number;
    topK?: number;
    maxOutputTokens?: number;
    stopSequences?: string[];
  };
}

export interface ChatCompletionResponse {
  choices: Array<{
    message: {
      role: "assistant";
      content: string;
    };
    finishReason?: string;
  }>;
}

// ── Empty response (the graceful fallback) ────────────────────
// Returned whenever Gemini can't be reached or returns nothing.
// Callers check `completion?.choices?.[0]?.message?.content` —
// an empty string triggers their own fallback logic.
function emptyResponse(): ChatCompletionResponse {
  return {
    choices: [
      {
        message: { role: "assistant", content: "" },
        finishReason: "ERROR",
      },
    ],
  };
}

/**
 * Send a chat-style prompt to Gemini and get back a response shaped
 * like an OpenAI/ZAI completion.
 *
 * - Messages with role "system" or "assistant" are merged into Gemini's
 *   `systemInstruction` (Gemini only has one system instruction slot).
 * - Messages with role "user" become the conversation turns.
 * - Single user turn → `generateContent` (single-turn, cheaper).
 *   Multiple turns → `startChat` + `sendMessage` (multi-turn).
 *
 * NEVER throws. On any error, returns an empty-response object so the
 * caller can fall back gracefully without crashing the API route.
 */
export async function geminiChatComplete(
  req: ChatCompletionRequest,
): Promise<ChatCompletionResponse> {
  // ── Step 1: get the client (may be null if no API key) ──────
  const client = getClient();
  if (!client) {
    return emptyResponse();
  }

  // ── Step 2: validate input ──────────────────────────────────
  if (!req.messages || req.messages.length === 0) {
    return emptyResponse();
  }

  // ── Step 3: split messages into system instruction + turns ──
  const systemPieces: string[] = [];
  const turns: { role: "user" | "model"; text: string }[] = [];

  for (const m of req.messages) {
    if (m.role === "system" || m.role === "assistant") {
      // Gemini doesn't have an "assistant" role — it uses "model".
      // We fold system + assistant messages into the system instruction
      // so the prompt structure is preserved.
      if (m.content?.trim()) systemPieces.push(m.content.trim());
    } else {
      if (m.content?.trim()) turns.push({ role: "user", text: m.content });
    }
  }

  const systemInstruction = systemPieces.length > 0
    ? systemPieces.join("\n\n")
    : undefined;

  // No user turns → nothing to send to Gemini
  if (turns.length === 0) {
    return emptyResponse();
  }

  // ── Step 4: call Gemini (wrapped in try/catch — NEVER throws) ─
  let rawText = "";
  try {
    const model = client.getGenerativeModel({
      model: GEMINI_MODEL,
      generationConfig: req.generationConfig,
    });

    if (turns.length === 1) {
      // Single-turn — simplest path, slightly cheaper than startChat.
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: turns[0].text }] }],
        systemInstruction: systemInstruction
          ? { parts: [{ text: systemInstruction }] }
          : undefined,
      });
      rawText = result.response.text() ?? "";
    } else {
      // Multi-turn — use startChat with history (all but the last user turn).
      const history = turns.slice(0, -1).map((t) => ({
        role: t.role,
        parts: [{ text: t.text }],
      }));
      const lastTurn = turns[turns.length - 1];
      const chat = model.startChat({
        history,
        systemInstruction: systemInstruction
          ? { parts: [{ text: systemInstruction }] }
          : undefined,
      });
      const result = await chat.sendMessage(lastTurn.text);
      rawText = result.response.text() ?? "";
    }
  } catch (err: any) {
    // Log the error but DO NOT throw — return empty so the caller falls back.
    // Common causes: 404 (wrong model name), 403 (bad API key / quota),
    // 429 (rate limit), network timeout, malformed response.
    const status = err?.status || err?.code || "unknown";
    const message = err?.message || String(err);
    console.error(
      `[Gemini] API call failed [${status}]: ${message}. ` +
        `Model: ${GEMINI_MODEL}. Returning empty fallback so the UI still loads.`,
    );
    return emptyResponse();
  }

  // ── Step 5: return the response in the OpenAI-shaped envelope ─
  return {
    choices: [
      {
        message: {
          role: "assistant",
          content: rawText,
        },
        finishReason: "STOP",
      },
    ],
  };
}

/**
 * Convenience wrapper for the common "single prompt" case.
 * Returns the raw text (or "" on failure). NEVER throws.
 */
export async function geminiText(
  prompt: string,
  systemInstruction?: string,
): Promise<string> {
  try {
    const messages: ChatMessage[] = [];
    if (systemInstruction) {
      messages.push({ role: "system", content: systemInstruction });
    }
    messages.push({ role: "user", content: prompt });
    const res = await geminiChatComplete({ messages });
    return res.choices[0]?.message?.content ?? "";
  } catch (err) {
    // Defensive — geminiChatComplete shouldn't throw, but just in case.
    console.error("[Gemini] geminiText fallback:", err);
    return "";
  }
}

/**
 * Check whether Gemini is configured (API key present).
 * Useful for showing a "AI offline" banner in the UI without
 * making an actual API call.
 */
export function isGeminiConfigured(): boolean {
  return getApiKey() !== null;
}
