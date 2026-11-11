import { getYouTubeVideoId } from "./captions";
type ContentReply = {
  ok?: boolean;
  error?: string;
  message?: string;
  recording?: boolean;
  captionsEnabled?: boolean;
  count?: number;
  vtt?: string;
  translating?: boolean;
  translationError?: string;
  speechEnabled?: boolean;
  speechError?: string;
  syncEnabled?: boolean;
  syncWaiting?: boolean;
  speechGain?: number;
  originalMix?: number;
};
type CaptureMessageType = "LEARNDUB_CAPTURE_START" | "LEARNDUB_CAPTURE_STOP" | "LEARNDUB_CAPTURE_STATUS" | "LEARNDUB_TRANSLATION_TOGGLE" | "LEARNDUB_SPEECH_TOGGLE" | "LEARNDUB_RETRY";
const retryButton = document.querySelector<HTMLButtonElement>("#retry");
const speechButton = document.querySelector<HTMLButtonElement>("#speech-toggle");
const translationButton = document.querySelector<HTMLButtonElement>("#translate-toggle");
const syncMode = document.querySelector<HTMLInputElement>("#sync-mode");
const speechGain = document.querySelector<HTMLInputElement>("#speech-gain");
const originalMix = document.querySelector<HTMLInputElement>("#original-mix");
let settingsPending = false;
for (const input of [syncMode, speechGain, originalMix]) input?.addEventListener("change", async () => {
  if (!syncMode || !speechGain || !originalMix) return;
  settingsPending = true;
  try {
    const tab = await getYouTubeTab();
    const reply = await chrome.tabs.sendMessage(tab.id!, { type: "LEARNDUB_SETTINGS", sync: syncMode.checked,
      speechGain: Number(speechGain.value) / 100, originalMix: Number(originalMix.value) / 100 }) as ContentReply;
    if (!reply?.ok) throw new Error(reply?.error ?? "Тохиргоо хадгалагдсангүй.");
  } catch (error) { showError(error); }
  finally { settingsPending = false; }
});

const statusElement = document.querySelector<HTMLElement>("#status");
const captureStatusElement = document.querySelector<HTMLElement>("#capture-status");
const startButton = document.querySelector<HTMLButtonElement>("#capture-start");
const stopButton = document.querySelector<HTMLButtonElement>("#capture-stop");
const openAppButton = document.querySelector<HTMLButtonElement>("#open-app");
const transcribeButton = document.querySelector<HTMLButtonElement>("#open-transcribe");
transcribeButton?.addEventListener("click", async () => {
  try {
    const tab = await getYouTubeTab();
    const videoId = getYouTubeVideoId(tab.url ?? "");
    if (!videoId || tab.id === undefined) throw new Error("YouTube видеогоо нээнэ үү.");
    const url = new URL(chrome.runtime.getURL("dist/transcribe.html"));
    url.searchParams.set("tab", String(tab.id));
    url.searchParams.set("video", videoId);
    await chrome.tabs.create({ url: url.href });
  } catch (error) { showError(error); }
});
async function getYouTubeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.startsWith("https://www.youtube.com/")) {
    throw new Error("YouTube видео нээгээд extension-ээ дахин дарна уу.");
  }
  return tab;
}

async function sendToYouTube(message: { type: CaptureMessageType }) {
  const tab = await getYouTubeTab();
  if (tab.id === undefined) throw new Error("YouTube таб олдсонгүй. Дахин нээнэ үү.");
  try {
    return { tab, reply: await chrome.tabs.sendMessage(tab.id, message) as ContentReply };
  } catch {
    throw new Error("YouTube хуудсыг нээсний дараа extension-ээ шинэчилж дахин ачаална уу.");
  }
}

function showError(error: unknown) {
  if (statusElement) statusElement.textContent = error instanceof Error ? error.message : "Extension хүсэлтийг гүйцэтгэж чадсангүй.";
}

function setRecordingState(recording: boolean, count = 0) {
  if (startButton) startButton.disabled = recording;
  if (stopButton) stopButton.disabled = !recording;
  if (captureStatusElement) captureStatusElement.textContent = recording
    ? `Бичлэг үргэлжилж байна · ${count} хадмал`
    : `Бэлэн · ${count} хадмал бичигдсэн`;
}

async function refreshStatus() {
  try {
    const { reply } = await sendToYouTube({ type: "LEARNDUB_CAPTURE_STATUS" });
    if (!reply.ok) throw new Error(reply.error ?? "Хадмалын төлөв уншигдсангүй.");
    setRecordingState(Boolean(reply.recording), reply.count);
    if (retryButton) retryButton.hidden = !(reply.speechError || reply.translationError);
    if (!settingsPending) {
      if (syncMode) syncMode.checked = Boolean(reply.syncEnabled);
      if (speechGain && document.activeElement !== speechGain) speechGain.value = String((reply.speechGain ?? 1.25) * 100);
      if (originalMix && document.activeElement !== originalMix) originalMix.value = String((reply.originalMix ?? 0.15) * 100);
    }
    if (speechButton) {
      speechButton.disabled = !reply.translating;
      speechButton.textContent = reply.speechEnabled ? "Монгол дуу унтраах" : "Монгол дуу асаах";
    }
    if (translationButton) {
      translationButton.disabled = false;
      translationButton.textContent = reply.translating ? "Монгол хадмал унтраах" : "Монгол хадмал асаах";
    }
    if (statusElement) {
      statusElement.textContent = reply.speechError ?? reply.translationError ?? reply.error ?? (reply.syncWaiting
        ? "Синк: орчуулга/дуу бэлдэж байна… Видео түр хүлээж байна."
        : reply.translating
        ? "Монгол хадмал асаалттай. English CC асааж видеогоо тоглуулаарай."
        : reply.recording
        ? "Видеогоо тоглуулаад дууссаны дараа бичлэгийг зогсооно уу."
        : reply.captionsEnabled
          ? "YouTube CC асаалттай байна. Бичлэг эхлүүлээд видеогоо тоглуулаарай."
          : "Эхлээд YouTube дээр CC асааж, боломжтой бол English хадмал сонгоно уу.");
    }
  } catch (error) {
    showError(error);
    setRecordingState(false);
    if (translationButton) translationButton.disabled = true;
    if (speechButton) speechButton.disabled = true;
  }
}

translationButton?.addEventListener("click", async () => {
  translationButton.disabled = true;
  try {
    const { reply } = await sendToYouTube({ type: "LEARNDUB_TRANSLATION_TOGGLE" });
    if (!reply.ok) throw new Error(reply.error ?? "Монгол хадмалын төлөв өөрчлөгдсөнгүй.");
    await refreshStatus();
  } catch (error) {
    showError(error);
    translationButton.disabled = false;
  }
});

retryButton?.addEventListener("click", async () => {
  retryButton.disabled = true;
  try {
    const { reply } = await sendToYouTube({ type: "LEARNDUB_RETRY" });
    if (!reply.ok) throw new Error(reply.error ?? "Дахин оролдож чадсангүй.");
    await refreshStatus();
  } catch (error) { showError(error); }
  finally { retryButton.disabled = false; }
});

speechButton?.addEventListener("click", async () => {
  speechButton.disabled = true;
  try {
    const { reply } = await sendToYouTube({ type: "LEARNDUB_SPEECH_TOGGLE" });
    if (!reply.ok) throw new Error(reply.error ?? "Монгол дууг асааж чадсангүй.");
    await refreshStatus();
  } catch (error) {
    showError(error);
    speechButton.disabled = false;
  }
});

startButton?.addEventListener("click", async () => {
  startButton.disabled = true;
  try {
    const { reply } = await sendToYouTube({ type: "LEARNDUB_CAPTURE_START" });
    if (!reply.ok) throw new Error(reply.error ?? "Хадмалын бичлэг эхэлсэнгүй.");
    setRecordingState(true);
    if (statusElement) statusElement.textContent = reply.message ?? "Бичлэг эхэллээ.";
  } catch (error) {
    showError(error);
    setRecordingState(false);
  }
});

stopButton?.addEventListener("click", async () => {
  stopButton.disabled = true;
  try {
    const { tab, reply } = await sendToYouTube({ type: "LEARNDUB_CAPTURE_STOP" });
    if (!reply.ok || !reply.vtt) throw new Error(reply.error ?? "VTT хадмал үүссэнгүй.");
    const blobUrl = URL.createObjectURL(new Blob([reply.vtt], { type: "text/vtt;charset=utf-8" }));
    const link = document.createElement("a");
    const title = (tab.title ?? "youtube-subtitles").replace(/\s*-\s*YouTube\s*$/i, "").replace(/[<>:"/\\|?*]/g, "_").trim();
    link.href = blobUrl;
    link.download = `${title || "youtube-subtitles"}.en.vtt`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    setRecordingState(false, reply.count);
    if (statusElement) statusElement.textContent = `${reply.count} мөртэй хадмал татагдлаа. Веб аппын "Хадмал оруулах" дээр дарж Монгол хэл рүү орчуулаарай.`;
  } catch (error) {
    showError(error);
    await refreshStatus();
  }
});

openAppButton?.addEventListener("click", async () => {
  try {
    await chrome.tabs.create({ url: "http://localhost:3000" });
  } catch (error) {
    showError(error);
  }
});

void refreshStatus();
const statusTimer = window.setInterval(() => void refreshStatus(), 2000);
window.addEventListener("pagehide", () => window.clearInterval(statusTimer), { once: true });
