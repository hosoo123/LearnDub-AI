export type VideoCue = { start: number; end: number; text: string };

export function validateVideoCues(value: unknown): VideoCue[] {
  if (!Array.isArray(value) || !value.length || value.length > 20000) throw new Error("Бичлэгээс хугацаатай хадмал олдсонгүй.");
  const cues = value.map((cue: unknown) => {
    if (typeof cue !== "object" || cue === null || !("start" in cue) || !("end" in cue) || !("text" in cue)
      || typeof cue.start !== "number" || typeof cue.end !== "number" || !Number.isFinite(cue.start) || !Number.isFinite(cue.end)
      || cue.start < 0 || cue.end <= cue.start || typeof cue.text !== "string" || !cue.text.trim() || cue.text.length > 3000) {
      throw new Error("Яриа танилтын хадмалын формат буруу байна.");
    }
    return { start: cue.start, end: cue.end, text: cue.text.trim() };
  });
  return cues.sort((a, b) => a.start - b.start || a.end - b.end);
}

export class VideoCaptions {
  private videoId: string | undefined;
  private cues: VideoCue[] = [];

  hasFor(videoId: string | undefined) {
    return Boolean(videoId && videoId === this.videoId);
  }

  load(videoId: string, cues: unknown) {
    this.cues = validateVideoCues(cues);
    this.videoId = videoId;
    return this.cues.length;
  }

  read(videoId: string | undefined, time: number) {
    if (videoId !== this.videoId || !Number.isFinite(time)) return "";
    return this.cues.find((cue) => time >= cue.start && time < cue.end)?.text ?? "";
  }

  endAt(videoId: string | undefined, time: number) {
    if (!this.hasFor(videoId)) return undefined;
    return this.cues.find((cue) => time >= cue.start && time < cue.end)?.end;
  }

  upcoming(videoId: string | undefined, time: number) {
    if (!this.hasFor(videoId)) return [];
    return this.cues.filter((cue) => cue.start > time && cue.start <= time + 12).slice(0, 2);
  }
}
