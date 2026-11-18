import { afterEach, describe, expect, it, vi } from "vitest";

const edgeTtsMock = vi.hoisted(() => vi.fn(class {
  async *streamAudio() {
    yield Buffer.from("mock-mp3");
  }
}));
vi.mock("node-edge-tts", () => ({ EdgeTTS: edgeTtsMock }));

import { TtsProviderError, ttsProvider } from "../src/lib/providers";
import { applySourceDelivery, detectSpeechEmotion, duckVideoAudio, estimateSpeechDuration, getSpeechProsody, getExpressiveSpeechProsody, getTimedExpressiveSpeechProsody, MONGOLIAN_TTS_VOICES, normalizeMongolianSpeechText } from "../src/lib/speech";

afterEach(() => edgeTtsMock.mockReset());

describe("Mongolian speech emotion", () => {
  it("normalizes numbers, URLs and common technical names for Mongolian speech", () => {
    expect(normalizeMongolianSpeechText("AI нь 125.5% өсөж, $20 болсон. https://openai.com/api"))
      .toBe("эй ай нь нэг зуу хорин тав цэг тав хувь өсөж, хорь доллар болсон. вэб хаяг Оупэн Эй Ай цэг com цэг эй пи ай");
    expect(normalizeMongolianSpeechText("YouTube, ChatGPT, API, TTS, CC"))
      .toBe("Юүтүб, Чат Жи Пи Ти, эй пи ай, ти ти эс, си си");
  });
  it("fits expressive delivery to the cue without extreme synthesis rates", () => {
    expect(estimateSpeechDuration("Нэг хоёр гурав дөрөв тав зургаа.")).toBeGreaterThan(2);
    expect(getTimedExpressiveSpeechProsody("Long line", "Нэг хоёр гурав дөрөв тав зургаа.", 1).rate).toBe("+45%");
    expect(getTimedExpressiveSpeechProsody("I'm sad", "Би гунигтай байна.", 8).rate).toBe("-14%");
  });
  it("adapts rate and volume to measured source delivery", () => {
    const energetic = applySourceDelivery({ rate: "+5%", pitch: "default", volume: "+6%" },
      { loudness: 0.1, pauseRatio: 0.1, tempo: 1.4, energy: 0.9 });
    expect(energetic.rate).toBe("+19%");
    expect(energetic.volume).toBe("+18%");
    expect(applySourceDelivery({ rate: "default", pitch: "default", volume: "default" },
      { loudness: 0, pauseRatio: 1, tempo: 1, energy: 0 }).rate).toBe("-6%");
  });
  it("adds expressive energy without making sad speech fast and cheerful", () => {
    expect(getExpressiveSpeechProsody("Wow, amazing!")).toEqual({ rate: "+22%", pitch: "+10%", volume: "+22%" });
    expect(getExpressiveSpeechProsody("I'm sad!").rate).toBe("-14%");
    expect(getExpressiveSpeechProsody("Go!").volume).toBe("+18%");
  });
  it.each([
    ["Fuck off, you bastard!", "angry"],
    ["Зайл, новш минь!", "angry"],
    ["I'm sorry, I miss you.", "sad"],
    ["Би чамайг санаж байна.", "sad"],
    ["Wow, this is amazing!", "excited"],
    ["Ямар гайхалтай вэ!", "excited"],
    ["I'm done with this.", "frustrated"],
    ["Би үүнээс бүр залхлаа.", "frustrated"],
    ["Phew, what a relief.", "relieved"],
    ["Ашгүй дээ.", "relieved"],
    ["Are you coming?", "curious"],
    ["Good morning.", "neutral"],
  ] as const)("detects %s as %s", (text, emotion) => {
    expect(detectSpeechEmotion(text)).toBe(emotion);
  });

  it("uses both the original and translation to identify emotion and vary voice intensity", () => {
    expect(detectSpeechEmotion("You're killing me.", "Чи намайг инээлгээд аллаа!")).toBe("happy");
    expect(detectSpeechEmotion("Neutral source.", "Би үүнээс бүр залхлаа.")).toBe("frustrated");
    expect(getSpeechProsody("I'm lonely and sad.")).toEqual({ rate: "-12%", pitch: "-8%", volume: "-8%" });
    expect(getSpeechProsody("Wow, this is amazing!")).toEqual({ rate: "+10%", pitch: "+8%", volume: "+5%" });
    expect(getSpeechProsody("I'm done with this.")).toEqual({ rate: "+3%", pitch: "-2%", volume: "+2%" });
    expect(getSpeechProsody("Good morning.")).toEqual({ rate: "default", pitch: "default", volume: "default" });
  });
});

describe("video audio ducking", () => {
  it("lowers the original video audio during speech and restores its previous volume", () => {
    const video = { muted: false, volume: 0.8 };
    const restoreVolume = duckVideoAudio(video, 0.12);

    expect(video.volume).toBe(0.12);
    restoreVolume?.();
    expect(video.volume).toBe(0.8);
  });

  it("does not change muted or already quieter video audio", () => {
    const mutedVideo = { muted: true, volume: 0.8 };
    expect(duckVideoAudio(mutedVideo, 0.12)).toBeUndefined();
    expect(mutedVideo.volume).toBe(0.8);

    const quietVideo = { muted: false, volume: 0.05 };
    duckVideoAudio(quietVideo, 0.12)?.();
    expect(quietVideo.volume).toBe(0.05);
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
      outputFormat: "audio-24khz-96kbitrate-mono-mp3",
      rate: "+8%",
      pitch: "-5%",
      volume: "+8%",
      timeout: 15_000,
    }));
  });

  it("reports remote synthesis errors instead of returning an empty audio result", async () => {
    edgeTtsMock.mockImplementation(class {
      async *streamAudio() {
        throw new Error("service unavailable");
      }
    });
    await expect(ttsProvider.synthesize("Сайн уу?")).rejects.toBeInstanceOf(TtsProviderError);
  });
});
