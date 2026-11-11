import { validateVideoCues, type VideoCue } from "./video-captions";
import { getYouTubeVideoId } from "./captions";

const params = new URLSearchParams(location.search);
const tabId = Number(params.get("tab"));
const videoId = params.get("video") ?? "";
const fileInput = document.querySelector<HTMLInputElement>("#video-file")!;
const quality = document.querySelector<HTMLSelectElement>("#quality")!;
const status = document.querySelector<HTMLElement>("#status")!;
const applyButton = document.querySelector<HTMLButtonElement>("#apply")!;
const downloadButton = document.querySelector<HTMLButtonElement>("#download")!;
const cancelButton = document.querySelector<HTMLButtonElement>("#cancel")!;
let controller: AbortController | undefined;
let cues: VideoCue[] = [];

async function apply() {
  if (!Number.isInteger(tabId) || tabId <= 0 || !videoId) throw new Error("YouTube дээр extension цэснээс энэ хуудсыг дахин нээнэ үү.");
  const tab = await chrome.tabs.get(tabId);
  if (getYouTubeVideoId(tab.url ?? "") !== videoId) throw new Error("YouTube видео солигдсон байна. Анхны видеогоо нээгээд “Видеонд холбох” дарна уу.");
  const reply = await chrome.tabs.sendMessage(tabId, { type: "LEARNDUB_VIDEO_CAPTIONS", videoId, cues });
  if (!reply?.ok) throw new Error(reply?.error ?? "Хадмал холбогдсонгүй. YouTube хуудсаа шинэчлээд дахин оролдоно уу.");
  status.textContent = `${cues.length} мөр бэлэн. YouTube дээр Монгол хадмал асаалттай. Энэ хуудсыг одоо хааж болно.`;
}

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  fileInput.value = "";
  if (!file) return;
  try {
    if (!/\.(mp4|webm)$/i.test(file.name) || !file.size || file.size > 250 * 1024 * 1024) throw new Error("250 MB хүртэлх MP4/WebM файл сонгоно уу.");
    controller = new AbortController();
    fileInput.disabled = quality.disabled = true;
    applyButton.disabled = downloadButton.disabled = true;
    cancelButton.disabled = false;
    status.textContent = "Яриаг таньж байна… Анхны удаа загвар татагдана. YouTube болон бусад табаа ашиглаж болно; энэ хуудсыг нээлттэй үлдээнэ үү.";
    const response = await fetch("http://localhost:3000/api/transcribe", {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream", "X-File-Name": encodeURIComponent(file.name), "X-Transcription-Quality": quality.value },
      body: file,
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30 * 60 * 1000)]),
    });
    const result = await response.json();
    controller.signal.throwIfAborted();
    if (!response.ok) throw new Error(result.error ?? "Яриа таньж чадсангүй.");
    cues = validateVideoCues(result.segments);
    applyButton.disabled = downloadButton.disabled = false;
    status.textContent = `${cues.length} мөр танигдлаа.`;
    try { await apply(); } catch (error) {
      status.textContent = `${cues.length} мөр хадгалахад бэлэн. ${error instanceof Error ? error.message : "Видеонд холбогдсонгүй."}`;
    }
  } catch (error) {
    status.textContent = controller?.signal.aborted ? "Хүлээлтийг цуцаллаа. Сервер дээр эхэлсэн боловсруулалт дуусах хүртэл үргэлжилж болно."
      : error instanceof TypeError ? "Локал LearnDub сервертэй холбогдсонгүй. Серверээ шалгаад дахин оролдоно уу."
      : error instanceof Error ? error.message : "Яриа таних алдаа.";
  } finally {
    controller = undefined;
    fileInput.disabled = quality.disabled = false;
    cancelButton.disabled = true;
    applyButton.disabled = downloadButton.disabled = cues.length === 0;
  }
});

cancelButton.addEventListener("click", () => controller?.abort());
applyButton.addEventListener("click", () => void apply().catch((error: unknown) => {
  status.textContent = error instanceof Error ? error.message : "Холболтын алдаа.";
}));
downloadButton.addEventListener("click", () => {
  const timestamp = (seconds: number) => {
    const milliseconds = Math.round(seconds * 1000);
    return `${String(Math.floor(milliseconds / 3600000)).padStart(2, "0")}:${String(Math.floor(milliseconds / 60000) % 60).padStart(2, "0")}:${String(Math.floor(milliseconds / 1000) % 60).padStart(2, "0")}.${String(milliseconds % 1000).padStart(3, "0")}`;
  };
  const content = "WEBVTT\n\n" + cues.map((cue, index) => `${index + 1}\n${timestamp(cue.start)} --> ${timestamp(cue.end)}\n${cue.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}`).join("\n\n") + "\n";
  const url = URL.createObjectURL(new Blob([content], { type: "text/vtt;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "learndub-transcript.en.vtt";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
window.addEventListener("pagehide", () => controller?.abort(), { once: true });
