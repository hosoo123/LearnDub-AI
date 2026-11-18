export const MONGOLIAN_TTS_VOICES = {
  bataa: "mn-MN-BataaNeural",
  yesui: "mn-MN-YesuiNeural",
} as const;

export type MongolianTtsVoice = (typeof MONGOLIAN_TTS_VOICES)[keyof typeof MONGOLIAN_TTS_VOICES];
export type SpeechEmotion = "angry" | "curious" | "excited" | "frustrated" | "happy" | "neutral" | "relieved" | "sad";

type SpeechProsody = { rate: string; pitch: string; volume: string };
export type SourceDeliveryProfile = { loudness: number; pauseRatio: number; tempo: number; energy: number };

const DIGIT_WORDS = ["тэг", "нэг", "хоёр", "гурав", "дөрөв", "тав", "зургаа", "долоо", "найм", "ес"];
const TENS_WORDS = ["", "арав", "хорь", "гуч", "дөч", "тавь", "жар", "дал", "ная", "ер"];
const TENS_COMPOUND_WORDS = ["", "арван", "хорин", "гучин", "дөчин", "тавин", "жаран", "далан", "наян", "ерэн"];

function integerToMongolian(value: number): string {
  if (value < 10) return DIGIT_WORDS[value];
  if (value < 100) {
    const tens = Math.floor(value / 10);
    const rest = value % 10;
    const stem = rest ? TENS_COMPOUND_WORDS[tens] : TENS_WORDS[tens];
    return rest ? `${stem} ${integerToMongolian(rest)}` : stem;
  }
  if (value < 1_000) {
    const hundreds = Math.floor(value / 100);
    const rest = value % 100;
    return `${hundreds === 1 ? "нэг" : integerToMongolian(hundreds)} зуу${rest ? ` ${integerToMongolian(rest)}` : ""}`;
  }
  const thousands = Math.floor(value / 1_000);
  const rest = value % 1_000;
  return `${thousands === 1 ? "нэг" : integerToMongolian(thousands)} мянга${rest ? ` ${integerToMongolian(rest)}` : ""}`;
}

function numberToMongolian(value: string) {
  const [integer, decimal] = value.replace(/,/g, "").split(".");
  const numeric = Number(integer);
  if (!Number.isSafeInteger(numeric) || numeric < 0 || numeric > 999_999) return value;
  const whole = integerToMongolian(numeric);
  return decimal ? `${whole} цэг ${decimal.split("").map((digit) => DIGIT_WORDS[Number(digit)]).join(" ")}` : whole;
}

export function normalizeMongolianSpeechText(text: string) {
  const names: Array<[RegExp, string]> = [
    [/\bChatGPT\b/gi, "Чат Жи Пи Ти"], [/\bYouTube\b/gi, "Юүтүб"], [/\bOllama\b/gi, "Оллама"],
    [/\bOpenAI\b/gi, "Оупэн Эй Ай"], [/\bAPI\b/gi, "эй пи ай"], [/\bTTS\b/gi, "ти ти эс"],
    [/\bURL\b/gi, "юү ар эл"], [/\bCC\b/gi, "си си"], [/\bAI\b/gi, "эй ай"], [/\bGPT\b/gi, "жи пи ти"],
  ];
  let normalized = text.normalize("NFC")
    .replace(/https?:\/\/([^\s]+)/gi, (_match, address: string) => `вэб хаяг ${address.replace(/^www\./i, "").replace(/[./_-]+/g, " цэг ")}`)
    .replace(/\$\s*(\d[\d,]*(?:\.\d+)?)/g, "$1 доллар")
    .replace(/(\d[\d,]*(?:\.\d+)?)\s*%/g, "$1 хувь")
    .replace(/\b\d[\d,]*(?:\.\d+)?\b/g, (value) => numberToMongolian(value));
  for (const [pattern, pronunciation] of names) normalized = normalized.replace(pattern, pronunciation);
  return normalized.replace(/\s+([,.;:!?])/g, "$1").replace(/([,.;:!?])(?=\S)/g, "$1 ").replace(/\s+/g, " ").trim();
}

function percentValue(value: string) {
  const parsed = /^([+-]?\d+)%$/.exec(value);
  return parsed ? Number(parsed[1]) : 0;
}

export function estimateSpeechDuration(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const punctuationPauses = (text.match(/[,;:]/g)?.length ?? 0) * 0.12 + (text.match(/[.!?…]/g)?.length ?? 0) * 0.22;
  return Math.max(0.65, words / 2.7 + punctuationPauses);
}

export function duckVideoAudio(
  video: Pick<HTMLVideoElement, "muted" | "volume">,
  duckedVolume: number,
): (() => void) | undefined {
  if (video.muted) return undefined;
  const originalVolume = video.volume;
  video.volume = Math.min(originalVolume, duckedVolume);
  return () => { video.volume = originalVolume; };
}

export function isMongolianTtsVoice(value: unknown): value is MongolianTtsVoice {
  return Object.values(MONGOLIAN_TTS_VOICES).some((voice) => voice === value);
}

export function detectSpeechEmotion(text: string, translatedText = ""): SpeechEmotion {
  const normalized = `${text}\n${translatedText}`.toLocaleLowerCase();

  if (/\b(fuck off|shut up|bullshit|i hate|furious|angry|idiot|bastard|damn it|what the fuck)\b|зайл|новш|уур|үзэн яд|шаасан/.test(normalized)) {
    return "angry";
  }
  if (/\b(sad|lonely|alone|miss you|heartbroken|cry|sorry|afraid|worried)\b|гуниг|ганцаард|санаж байна|уйлах|айж|санаа зов/.test(normalized)) {
    return "sad";
  }
  if (/\b(wow|amazing|awesome|wonderful|yay|can't wait|so excited)\b|гайхалтай|баяр|догдол/.test(normalized)) {
    return "excited";
  }
  if (/\b(phew|what a relief|thank goodness|finally)\b|ашгүй|санаа амар/.test(normalized)) {
    return "relieved";
  }
  if (/\b(happy|love you|glad|thank you)\b|хайртай|баярлалаа|аз жаргалтай|инээлгээд аллаа/.test(normalized)) {
    return "happy";
  }
  if (/\b(give me a break|i'm done with this|are you kidding me|you have some nerve)\b|боль л доо|залхлаа|залхааж гүйцлээ|ичих нүүргүй/.test(normalized)) {
    return "frustrated";
  }
  if (/[?？]/.test(normalized)) return "curious";
  return "neutral";
}

export function getSpeechProsody(text: string, translatedText = ""): SpeechProsody {
  switch (detectSpeechEmotion(text, translatedText)) {
    case "angry": return { rate: "+8%", pitch: "-5%", volume: "+8%" };
    case "curious": return { rate: "+3%", pitch: "+3%", volume: "default" };
    case "excited": return { rate: "+10%", pitch: "+8%", volume: "+5%" };
    case "frustrated": return { rate: "+3%", pitch: "-2%", volume: "+2%" };
    case "happy": return { rate: "+5%", pitch: "+5%", volume: "+2%" };
    case "relieved": return { rate: "-4%", pitch: "+1%", volume: "default" };
    case "sad": return { rate: "-12%", pitch: "-8%", volume: "-8%" };
    default: return { rate: "default", pitch: "default", volume: "default" };
  }
}

export function getExpressiveSpeechProsody(text: string, translatedText = ""): SpeechProsody {
  const emotion = detectSpeechEmotion(text, translatedText);
  const profiles: Record<SpeechEmotion, SpeechProsody> = {
    angry: { rate: "+18%", pitch: "-7%", volume: "+25%" },
    excited: { rate: "+22%", pitch: "+10%", volume: "+22%" },
    frustrated: { rate: "+12%", pitch: "-4%", volume: "+16%" },
    happy: { rate: "+12%", pitch: "+6%", volume: "+12%" },
    curious: { rate: "+5%", pitch: "+5%", volume: "+8%" },
    relieved: { rate: "-5%", pitch: "+2%", volume: "+5%" },
    sad: { rate: "-14%", pitch: "-9%", volume: "-5%" },
    neutral: { rate: "+5%", pitch: "default", volume: "+6%" },
  };
  const profile = profiles[emotion];
  // Exclamations add energy, without making sad dialogue sound cheerful.
  if (emotion === "neutral" && /!|！/.test(`${text}${translatedText}`)) {
    return { rate: "+14%", pitch: "+4%", volume: "+18%" };
  }
  return profile;
}

export function getTimedExpressiveSpeechProsody(text: string, translatedText: string, cueDuration?: number): SpeechProsody {
  const base = getExpressiveSpeechProsody(text, translatedText);
  if (cueDuration === undefined || !Number.isFinite(cueDuration) || cueDuration <= 0) return base;
  const requiredPercent = Math.round((estimateSpeechDuration(translatedText) / cueDuration - 1) * 100);
  const rate = Math.min(45, Math.max(-15, Math.max(percentValue(base.rate), requiredPercent)));
  return { ...base, rate: rate === 0 ? "default" : `${rate > 0 ? "+" : ""}${rate}%` };
}

export function applySourceDelivery(prosody: SpeechProsody, profile?: SourceDeliveryProfile): SpeechProsody {
  if (!profile) return prosody;
  const rateBase = percentValue(prosody.rate);
  const tempoPercent = Math.round((profile.tempo - 1) * 35);
  const pauseSlowdown = profile.pauseRatio > 0.55 ? -6 : 0;
  const volumeBase = percentValue(prosody.volume);
  const volumeLift = Math.round((profile.energy - 0.35) * 22);
  const rate = Math.min(45, Math.max(-15, rateBase + tempoPercent + pauseSlowdown));
  const volume = Math.min(30, Math.max(-12, volumeBase + volumeLift));
  return { ...prosody, rate: rate === 0 ? "default" : `${rate > 0 ? "+" : ""}${rate}%`,
    volume: volume === 0 ? "default" : `${volume > 0 ? "+" : ""}${volume}%` };
}
