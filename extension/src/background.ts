import { contextualSegments, type ContextCue } from "./translation-context";
import { resolveServerUrl } from "./server-config";
import { chooseEnglishTrack, parseYouTubeJson3 } from "./youtube-transcript";
const liveControllers = new Map<number, AbortController>();
const prefetchControllers = new Map<number, AbortController>();
// Cross-origin requests belong in the extension worker, not the YouTube page.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "LEARNDUB_LOAD_TRANSCRIPT") {
    if (sender.id !== chrome.runtime.id || sender.tab?.id === undefined || !sender.tab.url?.startsWith("https://www.youtube.com/")) return;
    void (async () => {
      try {
        const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: sender.tab!.id! }, world: "MAIN",
          func: () => {
            const page = window as typeof window & { ytInitialPlayerResponse?: unknown };
            const response = page.ytInitialPlayerResponse as { captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: unknown[] } } } | undefined;
            return response?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
          } });
        const track = chooseEnglishTrack(Array.isArray(result) ? result as Array<{ baseUrl?: string; languageCode?: string; kind?: string }> : []);
        if (!track?.baseUrl) throw new Error("English timed transcript олдсонгүй.");
        const url = new URL(track.baseUrl);
        url.searchParams.set("fmt", "json3");
        const response = await fetch(url.href, { signal: AbortSignal.timeout(15_000) });
        if (!response.ok) throw new Error(`Timed transcript HTTP ${response.status}`);
        const cues = parseYouTubeJson3(await response.json());
        if (!cues.length) throw new Error("Timed transcript хоосон байна.");
        sendResponse({ ok: true, cues });
      } catch (error) {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : "Timed transcript ачаалсангүй." });
      }
    })();
    return true;
  }
  if (message?.type === "LEARNDUB_TRANSLATE_BATCH") {
    if (sender.id !== chrome.runtime.id || !sender.tab?.url?.startsWith("https://www.youtube.com/")) return;
    const cues: Array<{ key: string; text: string }> = Array.isArray(message.cues) ? message.cues.slice(0, 5).filter((cue: unknown): cue is { key: string; text: string } =>
      typeof cue === "object" && cue !== null && "key" in cue && typeof cue.key === "string"
      && "text" in cue && typeof cue.text === "string" && cue.text.length > 0 && cue.text.length <= 3000) : [];
    if (!cues.length) { sendResponse({ ok: false, error: "Урьдчилан орчуулах мөр олдсонгүй." }); return; }
    void (async () => {
      const tabId = sender.tab!.id!;
      prefetchControllers.get(tabId)?.abort();
      const controller = new AbortController();
      prefetchControllers.set(tabId, controller);
      try {
        const serverUrl = await resolveServerUrl();
        const response = await fetch(`${serverUrl}/api/translate`, { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ segments: cues.map((cue, index) => ({ id: `ahead-${index}`, text: cue.text })), style: "dialogue", speed: "live" }),
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(300_000)]) });
        if (!response.headers.get("content-type")?.includes("application/json")) throw new Error(`LearnDub API JSON бус хариу өглөө (HTTP ${response.status}).`);
        const result = await response.json();
        if (!response.ok || !Array.isArray(result.translatedSegments)) throw new Error(result.error ?? "Урьдчилсан орчуулга амжилтгүй.");
        const translations = cues.flatMap((cue, index) => {
          const text = result.translatedSegments.find((item: { id?: string }) => item?.id === `ahead-${index}`)?.translatedText;
          return typeof text === "string" && text.trim() ? [{ key: cue.key, source: cue.text, text }] : [];
        });
        sendResponse({ ok: true, translations });
      } catch (error) { sendResponse({ ok: false, error: error instanceof Error ? error.message : "Урьдчилсан орчуулгын алдаа." }); }
      finally { if (prefetchControllers.get(tabId) === controller) prefetchControllers.delete(tabId); }
    })();
    return true;
  }
  if (message?.type !== "LEARNDUB_TRANSLATE" && message?.type !== "LEARNDUB_TTS") return;
  const speech = message.type === "LEARNDUB_TTS";
  if (sender.id !== chrome.runtime.id || !sender.tab?.url?.startsWith("https://www.youtube.com/")) return;
  if (typeof message.text !== "string" || !message.text.trim() || message.text.length > (speech ? 1500 : 3000)) {
    sendResponse({ ok: false, error: "Хадмалын текст буруу байна." });
    return;
  }
  const history: ContextCue[] = Array.isArray(message.history) ? message.history.slice(-2).filter((cue: unknown): cue is ContextCue =>
    typeof cue === "object" && cue !== null && "text" in cue && typeof cue.text === "string" && cue.text.length <= 3000
    && (!("translatedText" in cue) || (typeof cue.translatedText === "string" && cue.translatedText.length <= 3000))) : [];
  void (async () => {
    const tabId = sender.tab!.id!;
    const controller = speech ? undefined : new AbortController();
    if (controller) {
      liveControllers.get(tabId)?.abort();
      prefetchControllers.get(tabId)?.abort();
      liveControllers.set(tabId, controller);
    }
    try {
      const serverUrl = await resolveServerUrl();
      const response = await fetch(`${serverUrl}/api/${speech ? "tts" : "translate"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(speech ? {
          text: message.text, voice: "mn-MN-BataaNeural", expressive: true,
          ...(typeof message.sourceText === "string" ? { sourceText: message.sourceText.slice(0, 1500) } : {}),
          ...(typeof message.cueDuration === "number" && Number.isFinite(message.cueDuration)
            ? { cueDuration: Math.min(30, Math.max(0.2, message.cueDuration)) } : {}),
          ...(message.sourceDelivery && typeof message.sourceDelivery === "object" ? { sourceDelivery: message.sourceDelivery } : {}),
        } : {
          segments: contextualSegments(message.text, history), style: "dialogue", speed: "live",
        }),
        signal: controller
          ? AbortSignal.any([controller.signal, AbortSignal.timeout(300_000)])
          : AbortSignal.timeout(30_000),
      });
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) throw new Error(`LearnDub API JSON бус хариу өглөө (HTTP ${response.status}).`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Орчуулга амжилтгүй боллоо.");
      if (speech) {
        if (typeof result.audioUrl !== "string" || !result.audioUrl.startsWith("data:audio/mpeg;base64,")) {
          throw new Error("Монгол дууны үйлчилгээ буруу хариу өглөө.");
        }
        sendResponse({ ok: true, audioUrl: result.audioUrl });
        return;
      }
      const translatedText = Array.isArray(result.translatedSegments)
        ? result.translatedSegments.find((cue: { id?: string }) => cue?.id === "current")?.translatedText : undefined;
      if (typeof translatedText !== "string" || !translatedText.trim()) {
        throw new Error("Орчуулгын үйлчилгээ хоосон хариу өглөө.");
      }
      sendResponse({ ok: true, text: translatedText });
    } catch (error) {
      sendResponse({ ok: false, error: error instanceof TypeError
        ? "LearnDub сервертэй холбогдсонгүй. npm run dev ажиллуулаад дахин асаана уу."
        : error instanceof Error ? error.message : "Орчуулга амжилтгүй боллоо." });
    } finally { if (controller && liveControllers.get(tabId) === controller) liveControllers.delete(tabId); }
  })();
  return true;
});
