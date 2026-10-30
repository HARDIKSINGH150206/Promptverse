// Which language is the caller speaking? The script of what they said is the strongest signal
// (Sarvam writes Kannada in Kannada script, and so on); for Latin text the model decides.
import { TTS_LANGUAGES } from "../ai/tts";

/** "hi", "hi_IN", "Hindi"-ish codes -> "hi-IN"; null if it isn't a language we can speak. */
export function normLang(v: string | null | undefined): string | null {
  if (!v) return null;
  let base = v.trim().split(/[-_]/)[0].toLowerCase();
  if (base === "or") base = "od"; // Sarvam calls Odia od-IN
  const code = `${base}-IN`;
  return TTS_LANGUAGES.includes(code) ? code : null;
}

const SCRIPTS: [RegExp, string[]][] = [
  [/[ऀ-ॿ]/, ["hi-IN", "mr-IN"]], // Devanagari: Hindi unless the model says Marathi
  [/[ঀ-৿]/, ["bn-IN"]],
  [/[਀-੿]/, ["pa-IN"]],
  [/[઀-૿]/, ["gu-IN"]],
  [/[଀-୿]/, ["od-IN"]],
  [/[஀-௿]/, ["ta-IN"]],
  [/[ఀ-౿]/, ["te-IN"]],
  [/[ಀ-೿]/, ["kn-IN"]],
  [/[ഀ-ൿ]/, ["ml-IN"]],
];

/** Language of one caller turn from its script, refined by the model's guess; null for Latin text. */
export function scriptLanguage(text: string, hint: string | null | undefined): string | null {
  const h = normLang(hint);
  for (const [re, langs] of SCRIPTS) {
    if (re.test(text)) return h && langs.includes(h) ? h : langs[0];
  }
  return null;
}
