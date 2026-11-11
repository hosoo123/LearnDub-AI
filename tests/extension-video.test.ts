import { describe, expect, it } from "vitest";
import { contextualSegments } from "../extension/src/translation-context";
import { VideoCaptions, validateVideoCues } from "../extension/src/video-captions";

describe("contextual extension translation", () => {
  it("includes nearby dialogue and previous translations with a distinct target ID", () => {
    expect(contextualSegments("kidding me?", [{ text: "You have got to be", translatedText: "Чи арай" }])).toEqual([
      { id: "context-0", text: "You have got to be", contextTranslation: "Чи арай" },
      { id: "current", text: "kidding me?" },
    ]);
  });

  it("stays within the API budget while retaining the closest context", () => {
    const segments = contextualSegments("C".repeat(3000), [
      { text: "A".repeat(2000) }, { text: "B".repeat(1000), translatedText: "Б".repeat(1000) },
    ]);
    expect(segments.map(({ id }) => id)).toEqual(["context-0", "current"]);
    expect(segments.reduce((sum, cue) => sum + cue.text.length + ("contextTranslation" in cue ? cue.contextTranslation?.length ?? 0 : 0), 0)).toBe(5000);
  });
});

describe("video transcript playback", () => {
  it("sorts cues and follows the video clock including backwards seeks and gaps", () => {
    const captions = new VideoCaptions();
    captions.load("first", [{ start: 3, end: 4, text: "Later" }, { start: 1, end: 2, text: "Earlier" }]);
    expect(captions.read("first", 3.5)).toBe("Later");
    expect(captions.read("first", 1)).toBe("Earlier");
    expect(captions.read("first", 2)).toBe("");
    expect(captions.read("other", 1)).toBe("");
    expect(captions.hasFor("other")).toBe(false);
  });

  it("rejects malformed transcripts before replacing a working one", () => {
    expect(() => validateVideoCues([{ start: -1, end: 2, text: "Bad" }])).toThrow();
    expect(() => validateVideoCues([{ start: 1, end: Infinity, text: "Bad" }])).toThrow();
    expect(() => validateVideoCues([null])).toThrow();
    const captions = new VideoCaptions();
    captions.load("first", [{ start: 0, end: 1, text: "Good" }]);
    expect(() => captions.load("second", [])).toThrow();
    expect(captions.read("first", 0)).toBe("Good");
  });
});
