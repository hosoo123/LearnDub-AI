import { contextualSegments, type ContextCue } from "./translation-context";
// Cross-origin requests belong in the extension worker, not the YouTube page.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
    try {
      const response = await fetch(`http://localhost:3000/api/${speech ? "tts" : "translate"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(speech ? {
          text: message.text, voice: "mn-MN-BataaNeural", expressive: true,
          ...(typeof message.sourceText === "string" ? { sourceText: message.sourceText.slice(0, 1500) } : {}),
        } : {
          segments: contextualSegments(message.text, history), style: "dialogue",
        }),
        signal: AbortSignal.timeout(speech ? 30_000 : 300_000),
      });
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
    }
  })();
  return true;
});
