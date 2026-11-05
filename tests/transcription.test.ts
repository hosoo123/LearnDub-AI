import { describe, expect, it } from "vitest";
import { chunksToSubtitleSegments } from "../src/lib/transcription";

describe("chunksToSubtitleSegments", () => {
  it("normalizes text and preserves model timestamps", () => {
    expect(chunksToSubtitleSegments([
      { text: "  First   phrase. ", timestamp: [0, 2.5] },
      { text: "Second phrase.", timestamp: [2.5, 4] },
    ])).toEqual([
      { id: "cue-0", start: 0, end: 2.5, text: "First phrase." },
      { id: "cue-1", start: 2.5, end: 4, text: "Second phrase." },
    ]);
  });

  it("skips chunks with empty text or invalid timestamps", () => {
    expect(chunksToSubtitleSegments([
      { text: "", timestamp: [0, 1] },
      { text: "Missing start", timestamp: [null, 1] },
      { text: "Reversed", timestamp: [2, 1] },
      { text: "Valid", timestamp: [3, 4] },
    ])).toEqual([
      { id: "cue-0", start: 3, end: 4, text: "Valid" },
    ]);
  });
});
