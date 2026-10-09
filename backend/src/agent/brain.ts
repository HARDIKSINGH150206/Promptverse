// One LLM call per caller turn: extract stated fields, classify a pending yes/no, and draft a short
// spoken reply. The session's code decides what actually happens with any of it.
import OpenAI from "openai";
import { z } from "zod";
import { config } from "../config";
import { completeJson, extractJson } from "../ai/llm";
import { localNowLabel } from "../ai/time";

export type Role = "restaurant" | "recipient";

export interface BrainInput {
  role: Role;
  phase: string;
  draft: Record<string, unknown>;
  missing: string[];
  last_agent_utterance: string | null;
  pending_yes_no: string | null; // the yes/no question the caller is answering, if any
  user_text: string;
  history: { speaker: "agent" | "caller"; text: string }[];
  directory: { id: string; name: string; area: string }[];
  nowMs: number;
}

const Item = z.object({ name: z.string(), quantity: z.number().optional().nullable(), unit: z.string().optional().nullable() });
export const BrainOutput = z.object({
  updates: z
    .object({
      restaurant_id: z.string().nullable().optional(),
      recipient_id: z.string().nullable().optional(),
      items: z.array(Item).nullable().optional(),
      meal_count: z.number().nullable().optional(),
      people_count: z.number().nullable().optional(),
      diet: z.enum(["veg", "nonveg", "any"]).nullable().optional(),
      cooked_at: z.string().nullable().optional(),
      safe_until: z.string().nullable().optional(),
      needed_by: z.string().nullable().optional(),
      max_distance_km: z.number().nullable().optional(),
      pickup_notes: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
    })
    .default({}),
  answer: z.enum(["yes", "no", "unclear"]).nullable().optional(),
  answer_probability: z.number().min(0).max(1).nullable().optional(),
  wants_to_end: z.boolean().optional(),
  language: z.string().nullable().optional(),
  say: z.string().default(""),
});
export type BrainResult = z.infer<typeof BrainOutput>;

function system(input: BrainInput): string {
  const who =
    input.role === "restaurant"
      ? `You are AnnaRelay's phone agent taking a call from a RESTAURANT that has leftover cooked food to donate.
Fields: restaurant_id (pick from DIRECTORY by name), items [{name, quantity, unit}], meal_count (plates/portions),
diet ("veg" if no meat/fish/egg in any item, "nonveg" otherwise; never "any"), cooked_at (ISO), safe_until (ISO), pickup_notes.`
      : `You are AnnaRelay's phone agent taking a call from a SHELTER / NGO that needs food for its people today.
Fields: recipient_id (pick from DIRECTORY by name), people_count, diet ("veg" | "nonveg" | "any"), needed_by (ISO),
max_distance_km (only if stated), notes.`;
  return `${who}

Current time: ${new Date(input.nowMs).toISOString()} (UTC) = ${localNowLabel(input.nowMs)} in ${config.TZ_NAME}.
Callers speak local time; convert to ISO 8601 UTC ending in "Z". "made at 7" is the most recent 7 o'clock; "safe till 10" is the next 10 o'clock.

Rules:
- Put in "updates" ONLY what the caller actually said in THIS turn (corrections included). Never guess a field, never invent safe_until or needed_by.
- If a yes/no question is pending, classify the caller's reply in "answer" ("yes" / "no" / "unclear") with "answer_probability". A correction ("no, it's 30 plates") is "no" plus the update.
- "say": what you speak next, 1-2 short sentences, warm and natural, in the caller's language (Hindi if they speak Hindi, Hinglish if they mix, etc.). Acknowledge briefly, then ask for the NEXT missing field (MISSING is in priority order). Ask one thing at a time.
- You never decide that food is safe and you never confirm anything on the caller's behalf. Do not say the offer is created; the system handles confirmations.
- "language": BCP-47 code of the caller's language (en-IN, hi-IN, kn-IN, ta-IN, ...).
- "wants_to_end": true only if the caller wants to stop the call.

Return ONLY JSON: {"updates":{...},"answer":...,"answer_probability":...,"wants_to_end":false,"language":"en-IN","say":"..."}`;
}

function user(input: BrainInput): string {
  const hist = input.history.slice(-8).map((h) => `${h.speaker === "agent" ? "AGENT" : "CALLER"}: ${h.text}`).join("\n");
  return `DIRECTORY: ${JSON.stringify(input.directory)}
PHASE: ${input.phase}
DRAFT SO FAR: ${JSON.stringify(input.draft)}
MISSING (priority order): ${JSON.stringify(input.missing)}
PENDING YES/NO QUESTION: ${input.pending_yes_no ? JSON.stringify(input.pending_yes_no) : "none"}
RECENT CONVERSATION:
${hist || "(start of call)"}
CALLER JUST SAID: ${JSON.stringify(input.user_text)}`;
}

let fast: OpenAI | null = null;

export async function think(input: BrainInput): Promise<BrainResult> {
  const sys = system(input);
  const usr = user(input);
  let raw: string;
  // Prefer a dedicated agent model on Groq when configured (lower latency); else the normal LLM adapter.
  if (config.LLM_PROVIDER === "groq" && config.AGENT_MODEL) {
    fast ??= new OpenAI({ apiKey: config.LLM_API_KEY, baseURL: "https://api.groq.com/openai/v1" });
    const res = await fast.chat.completions.create({
      model: config.AGENT_MODEL,
      messages: [{ role: "system", content: sys }, { role: "user", content: usr }],
      response_format: { type: "json_object" },
      temperature: 0.3,
      ...({ reasoning_effort: "low" } as object),
    });
    raw = res.choices[0]?.message?.content ?? "";
  } else {
    raw = await completeJson(sys, usr, undefined, 9000);
  }
  const parsed = BrainOutput.safeParse(extractJson(raw));
  if (!parsed.success) throw new Error(`agent brain returned invalid JSON: ${parsed.error.issues[0]?.message}`);
  return parsed.data;
}
