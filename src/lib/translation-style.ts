import type { SubtitleSegment } from "./subtitle-parser";

export type TranslationStyle = "dialogue" | "song";
export type TranslationMode = "auto" | TranslationStyle;

const SONG_FILE_NAME_PATTERN = /(?:^|[^a-z0-9])(?:song|lyrics?|soundtrack|official audio|music video|mv|ost)(?=$|[^a-z0-9])/i;
const MONGOLIAN_SONG_FILE_NAME_PATTERN = /дууны?\s*үг|дуу|клип/i;
const SONG_CUE_PATTERN = /[♪♫♬🎵🎶]|\[(?:singing|sings|song|lyrics|music playing|music)\]/i;

export function detectTranslationStyle(
  segments: readonly Pick<SubtitleSegment, "text">[],
  fileNames: readonly (string | undefined)[] = [],
): TranslationStyle {
  if (fileNames.some((name) => name && (
    SONG_FILE_NAME_PATTERN.test(name.replace(/[_-]+/g, " "))
    || MONGOLIAN_SONG_FILE_NAME_PATTERN.test(name)
  ))) {
    return "song";
  }
  if (segments.some(({ text }) => SONG_CUE_PATTERN.test(text))) return "song";

  const occurrences = new Map<string, number>();
  for (const { text } of segments) {
    const normalized = text
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (normalized.length < 12) continue;
    occurrences.set(normalized, (occurrences.get(normalized) ?? 0) + 1);
  }

  const repeatedLines = [...occurrences.values()].filter((count) => count > 1);
  if (segments.length >= 6 && (repeatedLines.length >= 2 || repeatedLines.some((count) => count >= 3))) {
    return "song";
  }

  return "dialogue";
}
