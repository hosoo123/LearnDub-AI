import { afterEach, describe, expect, it, vi } from "vitest";
import { SyncGate } from "../extension/src/sync-gate";

afterEach(() => vi.useRealTimers());

function setup() {
  vi.useFakeTimers();
  const video = Object.assign(new EventTarget(), {
    paused: false, seeking: false, ended: false, isConnected: true, currentTime: 3,
    pause: vi.fn(), play: vi.fn().mockResolvedValue(undefined),
  });
  video.pause.mockImplementation(() => { video.paused = true; });
  const gate = new SyncGate();
  gate.enabled = true;
  return { gate, video, element: video as unknown as HTMLVideoElement };
}

describe("optional dubbing sync gate", () => {
  it("can wait for the same words again after a different cue", () => {
    const { gate, video, element } = setup();
    gate.update(element, "Hello", false);
    gate.update(element, "Hello", true);
    video.paused = false;
    gate.update(element, "Different cue", true);
    gate.update(element, "Hello", false);
    expect(video.pause).toHaveBeenCalledTimes(2);
    gate.reset(false);
  });

  it("holds playback for missing audio and resumes once it is ready", () => {
    const { gate, video, element } = setup();
    gate.update(element, "Hello", false);
    expect(video.pause).toHaveBeenCalledOnce();
    expect(gate.waiting).toBe(true);
    gate.update(element, "Hello", true);
    expect(video.play).toHaveBeenCalledOnce();
    expect(gate.waiting).toBe(false);
  });

  it("times out after eight seconds without repeatedly pausing the same cue", () => {
    const { gate, video, element } = setup();
    gate.update(element, "Hello", false);
    vi.advanceTimersByTime(8000);
    expect(video.play).toHaveBeenCalledOnce();
    video.paused = false;
    gate.update(element, "Hello", false);
    expect(video.pause).toHaveBeenCalledOnce();
  });

  it("does not resume after a seek or a user play event", () => {
    const { gate, video, element } = setup();
    gate.update(element, "Hello", false);
    video.dispatchEvent(new Event("seeking"));
    gate.update(element, "Hello", true);
    vi.advanceTimersByTime(9000);
    expect(video.play).not.toHaveBeenCalled();
    gate.reset(false);
    video.paused = false;
    gate.update(element, "Next", false);
    video.dispatchEvent(new Event("play"));
    vi.advanceTimersByTime(9000);
    expect(video.play).not.toHaveBeenCalled();
  });

  it("does not take ownership of an already paused video", () => {
    const { gate, video, element } = setup();
    video.paused = true;
    gate.update(element, "Hello", false);
    gate.reset();
    expect(video.pause).not.toHaveBeenCalled();
    expect(video.play).not.toHaveBeenCalled();
  });
});
