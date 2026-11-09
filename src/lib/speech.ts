export const MONGOLIAN_TTS_VOICES = {
  bataa: "mn-MN-BataaNeural",
  yesui: "mn-MN-YesuiNeural",
} as const;

export type MongolianTtsVoice = (typeof MONGOLIAN_TTS_VOICES)[keyof typeof MONGOLIAN_TTS_VOICES];
export type SpeechEmotion = "angry" | "curious" | "excited" | "happy" | "neutral" | "sad";

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

export function detectSpeechEmotion(text: string): SpeechEmotion {
  const normalized = text.toLocaleLowerCase();

  if (/\b(fuck off|shut up|bullshit|i hate|furious|angry|idiot|bastard|damn it)\b|зайл|новш|уур|үзэн яд/.test(normalized)) {
    return "angry";
  }
  if (/\b(sad|lonely|alone|miss you|heartbroken|cry|sorry|afraid|worried)\b|гуниг|ганцаард|санаж байна|уйлах|айж|санаа зов/.test(normalized)) {
    return "sad";
  }
  if (/\b(wow|amazing|awesome|wonderful|yay|can't wait|so excited)\b|гайхалтай|баяр|догдол/.test(normalized)) {
    return "excited";
  }
  if (/\b(happy|love you|glad|thank you)\b|хайртай|баярлалаа|аз жаргалтай/.test(normalized)) {
    return "happy";
  }
  if (/[?？]/.test(normalized)) return "curious";
  return "neutral";
}

export function getSpeechProsody(text: string) {
  switch (detectSpeechEmotion(text)) {
    case "angry": return { rate: "+8%", pitch: "-5%" };
    case "curious": return { rate: "+3%", pitch: "+3%" };
    case "excited": return { rate: "+10%", pitch: "+8%" };
    case "happy": return { rate: "+5%", pitch: "+5%" };
    case "sad": return { rate: "-12%", pitch: "-8%" };
    default: return { rate: "default", pitch: "default" };
  }
}
