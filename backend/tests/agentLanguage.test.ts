import { describe, expect, it } from "vitest";
import { normLang, scriptLanguage } from "../src/agent/language";
import { lines } from "../src/agent/templates";
import { ttsLanguage } from "../src/ai/tts";

describe("voice agent: caller language", () => {
  it("reads the language from the script the caller spoke in", () => {
    expect(scriptLanguage("ನಮಸ್ಕಾರ, 40 ಪ್ಲೇಟ್ biryani ಇದೆ", "en-IN")).toBe("kn-IN");
    expect(scriptLanguage("வணக்கம், 20 தட்டு சாதம்", null)).toBe("ta-IN");
    expect(scriptLanguage("నమస్కారం", null)).toBe("te-IN");
    expect(scriptLanguage("তিরিশ প্লেট খাবার", null)).toBe("bn-IN");
    expect(scriptLanguage("तीस प्लेट पुलाव बचा है", null)).toBe("hi-IN");
  });

  it("lets the model tell Marathi from Hindi (both Devanagari) but not override the script", () => {
    expect(scriptLanguage("आज जेवण उरलं आहे", "mr-IN")).toBe("mr-IN");
    expect(scriptLanguage("तीस प्लेट पुलाव", "en-IN")).toBe("hi-IN");
  });

  it("leaves Latin text to the model", () => {
    expect(scriptLanguage("haan theek hai", "hi-IN")).toBeNull();
  });

  it("normalises short codes so the right voice is used", () => {
    expect(normLang("hi")).toBe("hi-IN");
    expect(normLang("kn_IN")).toBe("kn-IN");
    expect(normLang("or")).toBe("od-IN");
    expect(normLang("fr")).toBeNull();
    expect(ttsLanguage("hi")).toBe("hi-IN");
    expect(ttsLanguage(null)).toBe("en-IN");
  });

  it("has the safety lines in each supported language and falls back to English", () => {
    expect(lines("kn-IN").checklist("")).toContain("ಹೌದು");
    expect(lines("ta-IN").summaryR("x", true)).toContain("சைவம்");
    expect(lines("te-IN").repeatYesNo).toContain("అవును");
    expect(lines("gu-IN")).toBe(lines("en-IN"));
  });
});
