// Forcing Git update
import { GoogleGenerativeAI } from "@google/generative-ai";

// ============================================================
// Gemini-powered DIDI (AI Chief of Staff) helper.
//
// This module replaces the previous `z-ai-web-dev-sdk` integration.
// It exposes a single function — `geminiChatComplete` — whose call
// signature and return shape intentionally mirror the old SDK so the
// existing API routes don't need their destructuring logic changed:
//
//   const completion = await geminiChatComplete({
//     messages: [
//       { role: "assistant", content: SYSTEM_PROMPT },
//       { role: "user", content: userPrompt },
//     ],
//     thinking: { type: "disabled" }, // accepted for back-compat, ignored
//   });
//   const text = completion?.choices?.[0]?.message?.content;
//
// The `thinking` field is accepted but ignored — Gemini 1.5 Flash
// doesn't expose a thinking toggle. It's kept in the signature so
// existing call sites compile without modification.
// ============================================================

const MODEL_NAME = "gemini-1.5-flash";

let cachedClient: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey || apiKey.length < 10) {
    throw new Error(
      "GOOGLE_API_KEY environment variable is missing or too short. " +
        "Get a key from https://aistudio.google.com/app/apikey and set it in your .env file.",
    );
  }
  cachedClient = new GoogleGenerativeAI(apiKey);
  return cachedClient;
}

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

/**
 * Send a chat-style prompt to Gemini 1.5 Flash and get back a response
 * shaped like an OpenAI/ZAI completion (so existing callers don't change).
 *
 * - Messages with role "system" or "assistant" are merged into Gemini's
 *   `systemInstruction` (Gemini only has one system instruction slot).
 * - Messages with role "user" become the conversation turns.
 * - If there's exactly one user message and a system instruction, we use
 *   `generateContent` (single-turn). Otherwise we use `startChat` +
 *   `sendMessage` (multi-turn).
 */
export async function geminiChatComplete(
  req: ChatCompletionRequest,
): Promise<ChatCompletionResponse> {
  const client = getClient();
  const model = client.getGenerativeModel({
    model: MODEL_NAME,
    generationConfig: req.generationConfig,
  });

  // Split messages into system-instruction pieces and conversation turns.
  const systemPieces: string[] = [];
  const turns: { role: "user" | "model"; text: string }[] = [];

  for (const m of req.messages) {
    if (m.role === "system" || m.role === "assistant") {
      // Gemini doesn't have an "assistant" role — it uses "model".
      // We fold system + assistant messages into the system instruction
      // so the prompt structure is preserved.
      if (m.content?.trim()) systemPieces.push(m.content.trim());
    } else {
      turns.push({ role: "user", text: m.content });
    }
  }

  const systemInstruction = systemPieces.length > 0
    ? systemPieces.join("\n\n")
    : undefined;

  let rawText = "";

  if (turns.length === 0) {
    // No user message — return the system instruction as-is (shouldn't happen
    // in practice, but keeps the contract honest).
    rawText = systemInstruction ?? "";
  } else if (turns.length === 1) {
    // Single-turn — simplest path, slightly cheaper than startChat.
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: turns[0].text }] }],
      systemInstruction: systemInstruction
        ? { role: "user", parts: [{ text: systemInstruction }] }
        : undefined,
    });
    rawText = result.response.text();
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
        ? { role: "user", parts: [{ text: systemInstruction }] }
        : undefined,
    });
    const result = await chat.sendMessage(lastTurn.text);
    rawText = result.response.text();
  }

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
 * Returns the raw text (or "" on failure).
 */
export async function geminiText(
  prompt: string,
  systemInstruction?: string,
): Promise<string> {
  const messages: ChatMessage[] = [];
  if (systemInstruction) {
    messages.push({ role: "system", content: systemInstruction });
  }
  messages.push({ role: "user", content: prompt });
  const res = await geminiChatComplete({ messages });
  return res.choices[0]?.message?.content ?? "";
}
