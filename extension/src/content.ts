import { CaptionRecorder, getYouTubeVideoId } from "./captions";
import { LiveTranslation } from "./live-translation";
import { VideoCaptions } from "./video-captions";

type CaptureMessage = { type: "LEARNDUB_CAPTURE_START" | "LEARNDUB_CAPTURE_STOP" | "LEARNDUB_CAPTURE_STATUS" | "LEARNDUB_TRANSLATION_TOGGLE" | "LEARNDUB_SPEECH_TOGGLE" | "LEARNDUB_VIDEO_CAPTIONS" | "LEARNDUB_SETTINGS" | "LEARNDUB_RETRY"; videoId?: string; cues?: unknown; sync?: boolean; speechGain?: number; originalMix?: number };
const videoCaptions = new VideoCaptions();
const liveTranslation = new LiveTranslation(() => videoCaptions.hasFor(getVideoId())
  ? videoCaptions.read(getVideoId(), document.querySelector<HTMLVideoElement>("video")?.currentTime ?? 0)
  : visibleCaptionText(), getVideoId,
  () => videoCaptions.endAt(getVideoId(), document.querySelector<HTMLVideoElement>("video")?.currentTime ?? 0),
  () => videoCaptions.upcoming(getVideoId(), document.querySelector<HTMLVideoElement>("video")?.currentTime ?? 0));

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
  if (message.type === "LEARNDUB_RETRY") {
    liveTranslation.retry();
    sendResponse({ ok: true }); return;
  }
  if (message.type === "LEARNDUB_SETTINGS") {
    if (typeof message.sync !== "boolean" || typeof message.speechGain !== "number" || !Number.isFinite(message.speechGain)
      || message.speechGain < 0.25 || message.speechGain > 2 || typeof message.originalMix !== "number"
      || !Number.isFinite(message.originalMix) || message.originalMix < 0 || message.originalMix > 1) {
      sendResponse({ ok: false, error: "Дууны тохиргоо буруу байна." }); return;
    }
    liveTranslation.syncGate.enabled = message.sync;
    if (!message.sync) liveTranslation.syncGate.reset();
    liveTranslation.speech.setMix(message.speechGain, message.originalMix);
    sendResponse({ ok: true }); return;
  }
  if (message.type === "LEARNDUB_VIDEO_CAPTIONS") {
    try {
      const videoId = getVideoId();
      if (!videoId || videoId !== message.videoId) throw new Error("Видео солигдсон байна. Зөв видеогоо нээгээд дахин оруулна уу.");
      const count = videoCaptions.load(videoId, message.cues);
      // Reset context/cache before using a different transcript.
      if (liveTranslation.enabled) liveTranslation.toggle();
      liveTranslation.toggle();
      sendResponse({ ok: true, count });
    } catch (error) {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : "Хадмал ачаалсангүй." });
    }
    return;
  }
  if (message.type === "LEARNDUB_SPEECH_TOGGLE") {
    if (!liveTranslation.enabled) { sendResponse({ ok: false, error: "Эхлээд Монгол хадмал асаана уу." }); return; }
    sendResponse({ ok: true, speechEnabled: liveTranslation.speech.toggle() });
    return;
  }
  if (message.type === "LEARNDUB_TRANSLATION_TOGGLE") {
    if (!getVideoId()) { sendResponse({ ok: false, error: "YouTube видео нээнэ үү." }); return; }
    sendResponse({ ok: true, translating: liveTranslation.toggle() });
    return;
  }
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
      translating: liveTranslation.enabled,
      translationError: liveTranslation.error,
      speechEnabled: liveTranslation.speech.enabled,
      speechError: liveTranslation.speech.error,
      syncEnabled: liveTranslation.syncGate.enabled,
      syncWaiting: liveTranslation.syncGate.waiting,
      speechGain: liveTranslation.speech.speechGain,
      originalMix: liveTranslation.speech.originalMix,
      recording: captureTimer !== undefined,
      count: recorder?.count ?? lastCaptureCount,
      captionsEnabled: document.querySelector(".ytp-subtitles-button[aria-pressed='true']") !== null,
      ...(captureError ? { error: captureError } : {}),
    });
  }
});

window.addEventListener("pagehide", () => {
  liveTranslation.dispose();
  if (captureTimer !== undefined) window.clearInterval(captureTimer);
  captureTimer = undefined;
  recorder = undefined;
  video = null;
});
