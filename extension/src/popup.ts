type ContentReply = {
  ok?: boolean;
  error?: string;
  message?: string;
  recording?: boolean;
  captionsEnabled?: boolean;
  count?: number;
  vtt?: string;
};
type CaptureMessageType = "LEARNDUB_CAPTURE_START" | "LEARNDUB_CAPTURE_STOP" | "LEARNDUB_CAPTURE_STATUS";

const statusElement = document.querySelector<HTMLElement>("#status");
const captureStatusElement = document.querySelector<HTMLElement>("#capture-status");
const startButton = document.querySelector<HTMLButtonElement>("#capture-start");
const stopButton = document.querySelector<HTMLButtonElement>("#capture-stop");
const openAppButton = document.querySelector<HTMLButtonElement>("#open-app");

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
    if (statusElement) {
      statusElement.textContent = reply.error ?? (reply.recording
        ? "Видеогоо тоглуулаад дууссаны дараа бичлэгийг зогсооно уу."
        : reply.captionsEnabled
          ? "YouTube CC асаалттай байна. Бичлэг эхлүүлээд видеогоо тоглуулаарай."
          : "Эхлээд YouTube дээр CC асааж, боломжтой бол English хадмал сонгоно уу.");
    }
  } catch (error) {
    showError(error);
    setRecordingState(false);
  }
}

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
