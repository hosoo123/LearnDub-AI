import { CaptionRecorder, getYouTubeVideoId } from "./captions";

type CaptureMessage = { type: "LEARNDUB_CAPTURE_START" | "LEARNDUB_CAPTURE_STOP" | "LEARNDUB_CAPTURE_STATUS" };

let video: HTMLVideoElement | null = null;
let captureTimer: number | undefined;
let recorder: CaptionRecorder | undefined;
let lastCaptureCount = 0;
let captureError: string | undefined;
let captureVideoId: string | undefined;

function visibleCaptionText() {
  return Array.from(document.querySelectorAll<HTMLElement>(".ytp-caption-segment"))
    .filter((element) => element.getClientRects().length > 0)
    .map((element) => element.textContent?.trim() ?? "")
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function getVideoId() {
  return getYouTubeVideoId(window.location.href);
}

function startCapture() {
  if (captureTimer !== undefined) return { ok: false, error: "Хадмалын бичлэг аль хэдийн эхэлсэн байна." };
  const videoId = getVideoId();
  if (!videoId) return { ok: false, error: "YouTube дээр видео, Shorts эсвэл live үзэх хуудсыг нээгээд дахин оролдоно уу." };
  video = document.querySelector<HTMLVideoElement>("video");
  if (!video) return { ok: false, error: "Энэ YouTube хуудсан дээр видео олдсонгүй." };

  try {
    recorder = new CaptionRecorder(visibleCaptionText);
    recorder.start(video.currentTime);
  } catch (error) {
    recorder = undefined;
    video = null;
    return { ok: false, error: error instanceof Error ? error.message : "Хадмалын бичлэг эхэлсэнгүй." };
  }
  captureVideoId = videoId;
  lastCaptureCount = 0;
  captureError = undefined;
  captureTimer = window.setInterval(sampleCapture, 200);
  return { ok: true, message: "Хадмал бичиж эхэллээ. YouTube дээр CC асааж видеог тоглуулна уу." };
}

function sampleCapture() {
  if (!video?.isConnected || document.querySelector("video") !== video || getVideoId() !== captureVideoId) {
    if (captureTimer !== undefined) window.clearInterval(captureTimer);
    captureTimer = undefined;
    recorder = undefined;
    video = null;
    captureVideoId = undefined;
    lastCaptureCount = 0;
    captureError = "YouTube видео солигдлоо. Шинэ видеон дээр хадмал бичлэгээ дахин эхлүүлнэ үү.";
    return;
  }
  recorder?.sample(video.currentTime);
}

function stopCapture() {
  if (captureTimer === undefined) return { ok: false, error: "Эхлээд хадмалын бичлэгийг эхлүүлнэ үү." };
  window.clearInterval(captureTimer);
  captureTimer = undefined;
  if (!recorder || !video) return { ok: false, error: "Хадмалын бичлэгийн төлөв алдагдсан байна. Дахин эхлүүлнэ үү." };
  const completedRecorder = recorder;
  const stopTime = video.currentTime;
  recorder = undefined;
  video = null;
  try {
    const vtt = completedRecorder.stop(stopTime);
    lastCaptureCount = completedRecorder.count;
    captureError = undefined;
    return { ok: true, vtt, count: lastCaptureCount };
  } catch (error) {
    lastCaptureCount = completedRecorder.count;
    captureError = error instanceof Error ? error.message : "VTT хадмал үүсгэж чадсангүй.";
    return { ok: false, error: captureError };
  }
}

chrome.runtime.onMessage.addListener((message: CaptureMessage, _sender, sendResponse) => {
  if (message.type === "LEARNDUB_CAPTURE_START") {
    sendResponse(startCapture());
    return;
  }
  if (message.type === "LEARNDUB_CAPTURE_STOP") {
    sendResponse(stopCapture());
    return;
  }
  if (message.type === "LEARNDUB_CAPTURE_STATUS") {
    sendResponse({
      ok: true,
      recording: captureTimer !== undefined,
      count: recorder?.count ?? lastCaptureCount,
      captionsEnabled: document.querySelector(".ytp-subtitles-button[aria-pressed='true']") !== null,
      ...(captureError ? { error: captureError } : {}),
    });
  }
});
