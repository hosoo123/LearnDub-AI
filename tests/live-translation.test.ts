import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveTranslation } from "../extension/src/live-translation";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function setup() {
  vi.useFakeTimers();
  let caption = "Hello";
  const overlay = { style: { cssText: "" }, textContent: "", hidden: false, isConnected: true, remove: vi.fn() };
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal("document", { querySelector: (selector: string) => selector === "video" ? null : ({ append: vi.fn() }), createElement: () => overlay });
  const sendMessage = vi.fn();
  vi.stubGlobal("chrome", { runtime: { sendMessage } });
  const live = new LiveTranslation(() => caption, () => "video-1");
  return { live, overlay, sendMessage, setCaption: (value: string) => { caption = value; } };
}

describe("live YouTube translation", () => {
  it("retries failed translation without turning translation off", async () => {
    const { live, sendMessage, overlay } = setup();
    sendMessage.mockResolvedValueOnce({ ok: false, error: "Offline" })
      .mockResolvedValue({ ok: true, text: "Сэргээлээ" });
    live.toggle();
    await vi.advanceTimersByTimeAsync(750);
    expect(live.error).toBe("Offline");
    live.retry();
    await vi.advanceTimersByTimeAsync(300);
    expect(live.enabled).toBe(true);
    expect(live.error).toBeUndefined();
    expect(overlay.textContent).toBe("Сэргээлээ");
    live.toggle();
  });

  it("can restart while an old translation request is still pending", async () => {
    const { live, sendMessage, overlay } = setup();
    let finishOld!: (reply: unknown) => void;
    sendMessage.mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; }))
      .mockResolvedValue({ ok: true, text: "Шинэ орчуулга" });
    live.toggle();
    await vi.advanceTimersByTimeAsync(600);
    live.toggle();
    live.toggle();
    await vi.advanceTimersByTimeAsync(750);
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(overlay.textContent).toBe("Шинэ орчуулга");
    finishOld({ ok: true, text: "Хуучин орчуулга" });
    await vi.advanceTimersByTimeAsync(150);
    expect(overlay.textContent).toBe("Шинэ орчуулга");
    live.toggle();
  });

  it("shows translated captions and reuses cached lines", async () => {
    const { live, overlay, sendMessage, setCaption } = setup();
    sendMessage.mockResolvedValue({ ok: true, text: "Сайн уу" });
    live.toggle();
    await vi.advanceTimersByTimeAsync(750);
    expect(overlay.textContent).toBe("Сайн уу");
    setCaption("");
    await vi.advanceTimersByTimeAsync(150);
    expect(overlay.hidden).toBe(true);
    setCaption("Hello");
    await vi.advanceTimersByTimeAsync(750);
    expect(overlay.textContent).toBe("Сайн уу");
    expect(sendMessage).toHaveBeenCalledTimes(1);
    live.toggle();
  });

  it("discards responses after the caption changes or translation is disabled", async () => {
    const { live, overlay, sendMessage, setCaption } = setup();
    let finish!: (reply: unknown) => void;
    sendMessage.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    live.toggle();
    await vi.advanceTimersByTimeAsync(600);
    setCaption("Next sentence");
    finish({ ok: true, text: "Хуучин мөр" });
    await vi.advanceTimersByTimeAsync(150);
    expect(overlay.textContent).not.toBe("Хуучин мөр");
    await vi.advanceTimersByTimeAsync(600);
    live.toggle();
    finish({ ok: true, text: "Дараагийн мөр" });
    await vi.advanceTimersByTimeAsync(150);
    expect(overlay.textContent).not.toBe("Дараагийн мөр");
    expect(overlay.remove).toHaveBeenCalled();
  });

  it("stops retrying on a server error until the user toggles translation", async () => {
    const { live, sendMessage } = setup();
    sendMessage.mockResolvedValue({ ok: false, error: "Server unavailable" });
    live.toggle();
    await vi.advanceTimersByTimeAsync(3000);
    expect(live.error).toBe("Server unavailable");
    expect(sendMessage).toHaveBeenCalledTimes(1);
    live.toggle();
  });
});
