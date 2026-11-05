import { CapturedCaption, captionsToVtt } from "./captions";

type CaptureMessage = { type: "LEARNDUB_CAPTURE_START" | "LEARNDUB_CAPTURE_STOP" | "LEARNDUB_CAPTURE_STATUS" };

let video: HTMLVideoElement | null = null;
let captureTimer: number | undefined;
let capturedCaptions: CapturedCaption[] = [];
let activeText = "";
let lastVideoTime = 0;

function visibleCaptionText() {
  return Array.from(document.querySelectorAll<HTMLElement>(".ytp-caption-segment"))
    .filter((element) => element.getClientRects().length > 0)
    .map((element) => element.textContent?.trim() ?? "")
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function closeActiveCaption(time: number) {
  const current = capturedCaptions.at(-1);
  if (!current || !activeText) return;
  current.end = Math.max(time, current.start + 0.1);
  activeText = "";
}

function sampleCaption() {
  if (!video) return;
  const time = video.currentTime;
  if (time < lastVideoTime) closeActiveCaption(lastVideoTime);
  lastVideoTime = time;

  const text = visibleCaptionText();
  if (text === activeText) {
    const current = capturedCaptions.at(-1);
    if (current) current.end = Math.max(time, current.start + 0.1);
    return;
  }

  closeActiveCaption(time);
  if (text) {
    capturedCaptions.push({ start: time, end: time + 0.1, text });
    activeText = text;
  }
}

function startCapture() {
  if (captureTimer !== undefined) return { ok: false, error: "Хадмалын бичлэг аль хэдийн эхэлсэн байна." };
  video = document.querySelector<HTMLVideoElement>("video");
  if (!video) return { ok: false, error: "Энэ YouTube хуудсан дээр видео олдсонгүй." };

  capturedCaptions = [];
  activeText = "";
  lastVideoTime = video.currentTime;
  sampleCaption();
  captureTimer = window.setInterval(sampleCaption, 200);
  return { ok: true, message: "Хадмал бичиж эхэллээ. YouTube дээр CC асааж видеог тоглуулна уу." };
}

function stopCapture() {
  if (captureTimer === undefined) return { ok: false, error: "Эхлээд хадмалын бичлэгийг эхлүүлнэ үү." };
  sampleCaption();
  window.clearInterval(captureTimer);
  captureTimer = undefined;
  closeActiveCaption((video?.currentTime ?? lastVideoTime) + 1.5);

  try {
    return { ok: true, vtt: captionsToVtt(capturedCaptions), count: capturedCaptions.length };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "VTT хадмал үүсгэж чадсангүй." };
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
      count: capturedCaptions.length,
      captionsEnabled: document.querySelector(".ytp-subtitles-button[aria-pressed='true']") !== null,
    });
  }
});
