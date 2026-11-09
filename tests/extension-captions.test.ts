import { describe, expect, it } from "vitest";
import { CaptionRecorder, captionsToVtt } from "../extension/src/captions";

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

  it("records visible captions with their video timing and does not extend the last cue past stop", () => {
    let visibleText = "First caption";
    const recorder = new CaptionRecorder(() => visibleText);

    recorder.start(1);
    recorder.sample(1.5);
    visibleText = "Second caption";
    recorder.sample(2);
    const vtt = recorder.stop(2.4);

    expect(vtt).toContain("00:00:01.000 --> 00:00:02.000\nFirst caption");
    expect(vtt).toContain("00:00:02.000 --> 00:00:02.400\nSecond caption");
    expect(recorder.isRecording).toBe(false);
    expect(recorder.count).toBe(2);
  });

  it("orders cues by playback time after a seek backward", () => {
    let visibleText = "Later caption";
    const recorder = new CaptionRecorder(() => visibleText);

    recorder.start(10);
    recorder.sample(11);
    visibleText = "Earlier caption";
    recorder.sample(3);
    const vtt = recorder.stop(4);

    expect(vtt.indexOf("Earlier caption")).toBeLessThan(vtt.indexOf("Later caption"));
  });

  it("rejects capture starts with an invalid video time", () => {
    const recorder = new CaptionRecorder(() => "Caption");
    expect(() => recorder.start(Number.NaN)).toThrow("хугацаа буруу");
  });
});
