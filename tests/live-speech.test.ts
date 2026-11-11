import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveSpeech, synchronizedSpeechRate } from "../extension/src/live-speech";
import { voiceBoost } from "../extension/src/voice-mixer";

afterEach(() => vi.unstubAllGlobals());

function setup() {
  const video = Object.assign(new EventTarget(), { paused: false, seeking: false, muted: false, volume: 0.8, playbackRate: 1 });
  const audio = { pause: vi.fn(), play: vi.fn().mockResolvedValue(undefined), playbackRate: 1, currentTime: 0, duration: 3, onended: undefined, onerror: undefined };
  vi.stubGlobal("Audio", function () { return audio; });
  const sendMessage = vi.fn();
  vi.stubGlobal("chrome", { runtime: { sendMessage } });
  const speech = new LiveSpeech();
  speech.toggle();
  return { speech, video: video as unknown as HTMLVideoElement, audio, sendMessage };
}

describe("extension speech", () => {
  it("does not start two audio players when pause and resume happen during synthesis", async () => {
    const { speech, video, audio, sendMessage } = setup();
    let finish!: (reply: unknown) => void;
    sendMessage.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    speech.sync(video, "Hello", "Сайн уу");
    video.dispatchEvent(new Event("pause"));
    speech.sync(video, "Hello", "Сайн уу");
    finish({ ok: true, audioUrl: "data:audio/mpeg;base64,test" });
    await vi.waitFor(() => expect(audio.play).toHaveBeenCalledOnce());
    expect(sendMessage).toHaveBeenCalledOnce();
    speech.toggle();
  });

  it("boosts quiet speech without boosting silence or already loud speech", () => {
    expect(voiceBoost(0)).toBe(1);
    expect(voiceBoost(0.004)).toBe(1);
    expect(voiceBoost(0.02)).toBe(3);
    expect(voiceBoost(0.08)).toBe(1.5);
    expect(voiceBoost(0.5)).toBe(1);
  });

  it("resumes the same audio position after video pause and waits for buffering to end", async () => {
    const { speech, video, audio, sendMessage } = setup();
    sendMessage.mockResolvedValue({ ok: true, audioUrl: "data:audio/mpeg;base64,test" });
    speech.sync(video, "Hello", "Сайн уу");
    await vi.waitFor(() => expect(audio.play).toHaveBeenCalledOnce());
    audio.currentTime = 1.25;
    video.dispatchEvent(new Event("waiting"));
    speech.sync(video, "Hello", "Сайн уу");
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(video.volume).toBe(0.8);
    video.dispatchEvent(new Event("playing"));
    speech.sync(video, "Hello", "Сайн уу");
    expect(audio.play).toHaveBeenCalledTimes(2);
    expect(audio.currentTime).toBe(1.25);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    speech.toggle();
  });

  it("shares pre-generated audio with playback instead of sending TTS twice", async () => {
    const { speech, video, audio, sendMessage } = setup();
    sendMessage.mockResolvedValue({ ok: true, audioUrl: "data:audio/mpeg;base64,test" });
    await speech.prepare("Hello", "Сайн уу");
    speech.sync(video, "Hello", "Сайн уу");
    await vi.waitFor(() => expect(audio.play).toHaveBeenCalledOnce());
    expect(sendMessage).toHaveBeenCalledTimes(1);
    speech.toggle();
  });

  it("speeds up long speech to fit the remaining cue while bounding extreme rates", () => {
    expect(synchronizedSpeechRate(6, 3, 1)).toBe(2);
    expect(synchronizedSpeechRate(4, 4, 1.5)).toBe(1.5);
    expect(synchronizedSpeechRate(20, 1, 1)).toBe(2.5);
    expect(synchronizedSpeechRate(NaN, NaN, 1.25)).toBe(1.25);
  });

  it("ducks video volume during speech and restores it on pause", async () => {
    const { speech, video, audio, sendMessage } = setup();
    sendMessage.mockResolvedValue({ ok: true, audioUrl: "data:audio/mpeg;base64,test" });
    speech.sync(video, "Hello", "Сайн уу");
    await vi.waitFor(() => expect(audio.play).toHaveBeenCalledOnce());
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ sourceText: "Hello" }));
    expect(video.volume).toBe(0.12);
    video.dispatchEvent(new Event("pause"));
    expect(audio.pause).toHaveBeenCalled();
    expect(video.volume).toBe(0.8);
  });

  it("does not play a delayed TTS response after seeking", async () => {
    const { speech, video, audio, sendMessage } = setup();
    let finish!: (reply: unknown) => void;
    sendMessage.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    speech.sync(video, "Hello", "Сайн уу");
    video.dispatchEvent(new Event("seeking"));
    finish({ ok: true, audioUrl: "data:audio/mpeg;base64,test" });
    await Promise.resolve();
    expect(audio.play).not.toHaveBeenCalled();
    expect(video.volume).toBe(0.8);
  });

  it("keeps a volume change made by the user and stops when disabled", async () => {
    const { speech, video, audio, sendMessage } = setup();
    sendMessage.mockResolvedValue({ ok: true, audioUrl: "data:audio/mpeg;base64,test" });
    speech.sync(video, "Hello", "Сайн уу");
    await vi.waitFor(() => expect(audio.play).toHaveBeenCalledOnce());
    video.volume = 0.5;
    speech.toggle();
    expect(video.volume).toBe(0.5);
    expect(audio.pause).toHaveBeenCalled();
  });
});
