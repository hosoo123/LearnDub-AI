import { describe, expect, it } from "vitest";
import { captionsToVtt } from "../extension/src/captions";

describe("YouTube caption export", () => {
  it("creates VTT cues with millisecond timing and escaped markup", () => {
    expect(captionsToVtt([
      { start: 1.25, end: 2.5, text: "Hello <world> & friends" },
      { start: 61, end: 62.005, text: "Second line" },
    ])).toBe("WEBVTT\n\n1\n00:00:01.250 --> 00:00:02.500\nHello &lt;world&gt; &amp; friends\n\n2\n00:01:01.000 --> 00:01:02.005\nSecond line\n");
  });

  it("rejects empty captures and invalid cue times", () => {
    expect(() => captionsToVtt([])).toThrow("харагдсан хадмал олдсонгүй");
    expect(() => captionsToVtt([{ start: 2, end: 1, text: "Invalid" }])).toThrow("хугацаа эсвэл текст буруу");
  });
});
