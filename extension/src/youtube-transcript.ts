export type TranscriptCue = { start: number; end: number; text: string };

type Json3Event = { tStartMs?: number; dDurationMs?: number; segs?: Array<{ utf8?: string }> };

export function parseYouTubeJson3(value: unknown): TranscriptCue[] {
  if (typeof value !== "object" || value === null || !("events" in value) || !Array.isArray(value.events)) return [];
  return (value.events as Json3Event[]).flatMap((event) => {
    if (!Number.isFinite(event.tStartMs) || !Number.isFinite(event.dDurationMs) || !Array.isArray(event.segs)) return [];
    const text = event.segs.map((segment) => segment.utf8 ?? "").join("").replace(/\n/g, " ").replace(/\s+/g, " ").trim();
    if (!text) return [];
    const start = event.tStartMs! / 1000;
    return [{ start, end: start + Math.max(0.1, event.dDurationMs! / 1000), text }];
  });
}

export function chooseEnglishTrack(tracks: readonly { baseUrl?: string; languageCode?: string; kind?: string }[]) {
  return tracks.find((track) => track.languageCode === "en" && track.kind !== "asr")
    ?? tracks.find((track) => track.languageCode === "en")
    ?? tracks.find((track) => track.languageCode?.startsWith("en"));
}
