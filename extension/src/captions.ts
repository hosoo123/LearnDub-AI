export type CapturedCaption = {
  start: number;
  end: number;
  text: string;
};

export function getYouTubeVideoId(href: string) {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return undefined;
  }

  if (url.protocol !== "https:" || url.hostname !== "www.youtube.com") return undefined;
  const watchId = url.pathname === "/watch" ? url.searchParams.get("v") : undefined;
  const pathId = /^\/(?:shorts|live|embed)\/([^/]+)/.exec(url.pathname)?.[1];
  const videoId = watchId ?? pathId;
  return videoId?.trim() || undefined;
}

export class CaptionRecorder {
  private readonly readCaption: () => string;
  private captions: CapturedCaption[] = [];
  private activeText = "";
  private lastVideoTime = 0;
  private recording = false;

  constructor(readCaption: () => string) {
    this.readCaption = readCaption;
  }

  get isRecording() {
    return this.recording;
  }

  get count() {
    return this.captions.length;
  }

  start(time: number) {
    if (this.recording) throw new Error("Хадмалын бичлэг аль хэдийн эхэлсэн байна.");
    if (!Number.isFinite(time) || time < 0) throw new Error("Видеоны хугацаа буруу байна.");
    this.captions = [];
    this.activeText = "";
    this.lastVideoTime = time;
    this.recording = true;
    this.sample(time);
  }

  sample(time: number) {
    if (!this.recording || !Number.isFinite(time) || time < 0) return;
    if (time < this.lastVideoTime) this.closeActiveCaption(this.lastVideoTime);
    this.lastVideoTime = time;

    const text = this.readCaption().replace(/\s+/g, " ").trim();
    if (text === this.activeText) {
      const current = this.captions.at(-1);
      if (current) current.end = Math.max(time, current.start + 0.1);
      return;
    }

    this.closeActiveCaption(time);
    if (text) {
      this.captions.push({ start: time, end: time + 0.1, text });
      this.activeText = text;
    }
  }

  stop(time: number) {
    if (!this.recording) throw new Error("Эхлээд хадмалын бичлэгийг эхлүүлнэ үү.");
    this.sample(time);
    this.closeActiveCaption(time);
    this.recording = false;
    return captionsToVtt(this.captions);
  }

  private closeActiveCaption(time: number) {
    const current = this.captions.at(-1);
    if (!current || !this.activeText) return;
    current.end = Math.max(time, current.start + 0.1);
    this.activeText = "";
  }
}

function formatTimestamp(seconds: number) {
  const milliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(milliseconds / 3_600_000).toString().padStart(2, "0");
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000).toString().padStart(2, "0");
  const remainingSeconds = Math.floor((milliseconds % 60_000) / 1000).toString().padStart(2, "0");
  const remainingMilliseconds = (milliseconds % 1000).toString().padStart(3, "0");
  return `${hours}:${minutes}:${remainingSeconds}.${remainingMilliseconds}`;
}

export function captionsToVtt(captions: readonly CapturedCaption[]) {
  if (!captions.length) throw new Error("Бичлэгийн хугацаанд харагдсан хадмал олдсонгүй. YouTube CC асааж дахин оролдоно уу.");

  const cues = [...captions]
    .sort((left, right) => left.start - right.start || left.end - right.end)
    .map(({ start, end, text }, index) => {
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || !text.trim()) {
        throw new Error("YouTube хадмалын хугацаа эсвэл текст буруу байна.");
      }
      const safeText = text.trim()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      return `${index + 1}\n${formatTimestamp(start)} --> ${formatTimestamp(end)}\n${safeText}`;
    });

  return `WEBVTT\n\n${cues.join("\n\n")}\n`;
}
