export const MONGOLIAN_TTS_VOICES = {
  bataa: "mn-MN-BataaNeural",
  yesui: "mn-MN-YesuiNeural",
} as const;

export type MongolianTtsVoice = (typeof MONGOLIAN_TTS_VOICES)[keyof typeof MONGOLIAN_TTS_VOICES];
export type SpeechEmotion = "angry" | "curious" | "excited" | "frustrated" | "happy" | "neutral" | "relieved" | "sad";

type SpeechProsody = { rate: string; pitch: string; volume: string };

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
