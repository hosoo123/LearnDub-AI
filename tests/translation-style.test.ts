import { describe, expect, it } from "vitest";
import { detectTranslationStyle } from "../src/lib/translation-style";

describe("translation style detection", () => {
  it.each([
    ["song.srt", "song"],
    ["official_audio_video.mp4", "song"],
    ["ДУУНЫ_ҮГ.vtt", "song"],
  ] as const)("detects a song from the filename %s", (fileName, expected) => {
    expect(detectTranslationStyle([], [fileName])).toBe(expected);
  });

  it("detects explicit music and singing cues", () => {
    expect(detectTranslationStyle([{ text: "[Singing]" }])).toBe("song");
    expect(detectTranslationStyle([{ text: "♪ Here comes the sun ♪" }])).toBe("song");
  });

  it("detects repeated chorus lines but not ordinary dialogue", () => {
    const repeatedLyrics = [
      "I will always be here",
      "Through the long and lonely night",
      "I will always be here",
      "Until the morning light",
      "I will always be here",
      "And I will sing it loud",
    ].map((text) => ({ text }));
    expect(detectTranslationStyle(repeatedLyrics)).toBe("song");
    expect(detectTranslationStyle([
      { text: "Are you coming with us today?" },
      { text: "Yes, I will be there soon." },
      { text: "Please remember to call me." },
      { text: "I will send you the address." },
      { text: "We can meet after lunch." },
      { text: "Thanks, see you later then." },
    ])).toBe("dialogue");
  });
});
