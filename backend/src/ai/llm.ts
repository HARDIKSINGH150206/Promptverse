// Generative LLM adapter. One real provider chosen by LLM_PROVIDER, each via its official SDK.
// Returns raw text (expected to be JSON); parse.ts validates it with zod.
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { config } from "../config";

export interface ImageInput { mimeType: string; base64: string }

export class LlmUnavailable extends Error {}

const DEFAULT_MODEL: Record<string, string> = {
  gemini: "gemini-2.5-flash",
  openai: "gpt-4o-mini",
  anthropic: "claude-haiku-5-5",
  groq: "openai/gpt-oss-120b",
};

export function llmModel(): string {
  return config.LLM_MODEL || DEFAULT_MODEL[config.LLM_PROVIDER] || "";
}

let gemini: GoogleGenAI | null = null;
let openai: OpenAI | null = null;
let groq: OpenAI | null = null;
let anthropic: Anthropic | null = null;

export async function completeJson(system: string, user: string, image?: ImageInput, timeoutMs = 8000): Promise<string> {
  if (config.LLM_PROVIDER === "mock") throw new LlmUnavailable("LLM_PROVIDER=mock");
  if (!config.LLM_API_KEY) throw new LlmUnavailable("LLM_API_KEY missing");
  const model = llmModel();

  const work = (async (): Promise<string> => {
    switch (config.LLM_PROVIDER) {
      case "gemini": {
        gemini ??= new GoogleGenAI({ apiKey: config.LLM_API_KEY });
        const parts: Array<Record<string, unknown>> = [];
        if (image) parts.push({ inlineData: { mimeType: image.mimeType, data: image.base64 } });
        parts.push({ text: user });
        const res = await gemini.models.generateContent({
          model,
          contents: [{ role: "user", parts }],
          config: { systemInstruction: system, responseMimeType: "application/json", temperature: 0 },
        });
        return res.text ?? "";
      }
      case "openai": {
        openai ??= new OpenAI({ apiKey: config.LLM_API_KEY });
        const content: OpenAI.Chat.ChatCompletionContentPart[] = [{ type: "text", text: user }];
        if (image) content.push({ type: "image_url", image_url: { url: `data:${image.mimeType};base64,${image.base64}` } });
        const res = await openai.chat.completions.create({
          model,
          messages: [{ role: "system", content: system }, { role: "user", content }],
          response_format: { type: "json_object" },
          temperature: 0,
        });
        return res.choices[0]?.message?.content ?? "";
      }
      case "groq": {
        // OpenAI-compatible API. gpt-oss models are text-only, so photos are skipped (photo_check stays advisory/null).
        groq ??= new OpenAI({ apiKey: config.LLM_API_KEY, baseURL: "https://api.groq.com/openai/v1" });
        const res = await groq.chat.completions.create({
          model,
          messages: [{ role: "system", content: system }, { role: "user", content: user }],
          response_format: { type: "json_object" },
          temperature: 0,
          ...({ reasoning_effort: "low" } as object),
        });
        return res.choices[0]?.message?.content ?? "";
      }
      case "anthropic": {
        anthropic ??= new Anthropic({ apiKey: config.LLM_API_KEY });
        const content: Anthropic.ContentBlockParam[] = [];
        if (image) {
          content.push({
            type: "image",
            source: { type: "base64", media_type: image.mimeType as "image/jpeg", data: image.base64 },
          });
        }
        content.push({ type: "text", text: `${user}\n\nRespond with only the JSON object.` });
        const res = await anthropic.messages.create({
          model,
          max_tokens: 1024,
          system,
          messages: [{ role: "user", content }],
        });
        return res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
      }
      default:
        throw new LlmUnavailable(`Unknown LLM_PROVIDER ${config.LLM_PROVIDER}`);
    }
  })();

  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new LlmUnavailable(`LLM timed out after ${timeoutMs} ms`)), timeoutMs);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Pull a JSON object out of a model reply (tolerates ```json fences). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : text).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  return JSON.parse(start >= 0 && end > start ? body.slice(start, end + 1) : body);
}
