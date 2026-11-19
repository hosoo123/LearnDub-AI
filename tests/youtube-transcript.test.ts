import { describe, expect, it } from "vitest";
import { chooseEnglishTrack, parseYouTubeJson3 } from "../extension/src/youtube-transcript";

describe("YouTube timed transcript", () => {
  it("parses JSON3 events into timed clean cues", () => {
    expect(parseYouTubeJson3({ events: [{ tStartMs: 1250, dDurationMs: 800, segs: [{ utf8: "Hello" }, { utf8: "\nworld" }] }] }))
      .toEqual([{ start: 1.25, end: 2.05, text: "Hello world" }]);
  });

  it("prefers authored English over automatic English", () => {
    expect(chooseEnglishTrack([{ languageCode: "en", kind: "asr", baseUrl: "auto" },
      { languageCode: "en", baseUrl: "manual" }])?.baseUrl).toBe("manual");
  });
});
