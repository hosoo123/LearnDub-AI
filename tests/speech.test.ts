import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const edgeTtsMock = vi.hoisted(() => vi.fn());
vi.mock("node-edge-tts", () => ({ EdgeTTS: edgeTtsMock }));

import { TtsProviderError, ttsProvider } from "../src/lib/providers";
import { detectSpeechEmotion, getSpeechProsody, MONGOLIAN_TTS_VOICES } from "../src/lib/speech";

beforeEach(() => {
  edgeTtsMock.mockImplementation(() => ({
    async *streamAudio() {
      yield Buffer.from("mock-mp3");
    },
  }));
});

afterEach(() => {
  edgeTtsMock.mockReset();
});

describe("Mongolian speech emotion", () => {
  it.each([
    ["Fuck off, you bastard!", "angry"],
    ["Зайл, новш минь!", "angry"],
    ["I'm sorry, I miss you.", "sad"],
    ["Би чамайг санаж байна.", "sad"],
    ["Wow, this is amazing!", "excited"],
    ["Ямар гайхалтай вэ!", "excited"],
    ["Are you coming?", "curious"],
    ["Good morning.", "neutral"],
  ] as const)("detects %s as %s", (text, emotion) => {
    expect(detectSpeechEmotion(text)).toBe(emotion);
  });

  it("uses gentler prosody for sad dialogue and more energetic prosody for excited dialogue", () => {
    expect(getSpeechProsody("I'm lonely and sad.")).toEqual({ rate: "-12%", pitch: "-8%" });
    expect(getSpeechProsody("Wow, this is amazing!")).toEqual({ rate: "+10%", pitch: "+8%" });
  });
});

describe("Mongolian neural TTS provider", () => {
  it("returns playable MP3 data and applies the selected voice and emotional prosody", async () => {
    await expect(ttsProvider.synthesize("Зайл, новш минь.", {
      voice: MONGOLIAN_TTS_VOICES.yesui,
      sourceText: "Fuck off, you bastard!",
    })).resolves.toMatchObject({
      status: "ready",
      audioUrl: `data:audio/mpeg;base64,${Buffer.from("mock-mp3").toString("base64")}`,
    });
    expect(edgeTtsMock).toHaveBeenCalledWith(expect.objectContaining({
      voice: MONGOLIAN_TTS_VOICES.yesui,
      lang: "mn-MN",
      rate: "+8%",
      pitch: "-5%",
      timeout: 15_000,
    }));
  });

  it("reports remote synthesis errors instead of returning an empty audio result", async () => {
    edgeTtsMock.mockImplementation(() => ({
      async *streamAudio() {
        throw new Error("service unavailable");
      },
    }));
    await expect(ttsProvider.synthesize("Сайн уу?")).rejects.toBeInstanceOf(TtsProviderError);
  });
});
