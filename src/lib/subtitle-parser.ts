export type SubtitleSegment = {
  id: string;
  start: number;
  end: number;
  text: string;
  translatedText?: string;
};

export type SubtitleEditDraft = {
  start: string;
  end: string;
  text: string;
  translatedText: string;
};

export type ParseSubtitleResult =
  | { ok: true; segments: SubtitleSegment[]; skippedDuplicates: number }
  | { ok: false; error: string };

export type TranslationTask = {
  segments: SubtitleSegment[];
  targetIds: string[];
};

export const MAX_SUBTITLE_FILE_BYTES = 1_000_000;
export const MAX_SUBTITLE_TEXT_LENGTH = 3_000;
const MAX_TRANSLATION_BATCH_TEXT_LENGTH = 5_000;

function translationTaskTextLength(segments: readonly SubtitleSegment[]) {
  return segments.reduce((total, segment) => total + segment.text.length + (segment.translatedText?.length ?? 0), 0);
}

export function buildMissingTranslationTasks(segments: readonly SubtitleSegment[], batchSize = 8): TranslationTask[] {
  if (!Number.isInteger(batchSize) || batchSize < 3) {
    throw new Error("Орчуулгын багц дор хаяж 3 мөрийн хэмжээтэй байх ёстой.");
  }

  const missingIndices = segments.flatMap((segment, index) => segment.translatedText?.trim() ? [] : [index]);
  const tasks: TranslationTask[] = [];
  let cursor = 0;

  while (cursor < missingIndices.length) {
    let runEndCursor = cursor;
    while (runEndCursor + 1 < missingIndices.length
      && missingIndices[runEndCursor + 1] === missingIndices[runEndCursor] + 1) {
      runEndCursor += 1;
    }

    while (cursor <= runEndCursor) {
      const firstTarget = missingIndices[cursor];
      const contextStart = Math.max(0, firstTarget - 1);
      let chunkEndCursor = cursor;
      let contextSegments = segments.slice(firstTarget, firstTarget + 1);
      const firstCandidate = segments.slice(contextStart, Math.min(segments.length, firstTarget + 2));
      if (translationTaskTextLength(firstCandidate) <= MAX_TRANSLATION_BATCH_TEXT_LENGTH) {
        contextSegments = firstCandidate;
      }

      while (chunkEndCursor < runEndCursor && chunkEndCursor - cursor + 1 < batchSize - 2) {
        const candidateEnd = chunkEndCursor + 1;
        const lastTarget = missingIndices[candidateEnd];
        const candidate = segments.slice(contextStart, Math.min(segments.length, lastTarget + 2));
        const totalTextLength = translationTaskTextLength(candidate);
        if (candidate.length > batchSize || totalTextLength > MAX_TRANSLATION_BATCH_TEXT_LENGTH) break;
        chunkEndCursor = candidateEnd;
        contextSegments = candidate;
      }

      const targetIds = missingIndices.slice(cursor, chunkEndCursor + 1).map((index) => segments[index].id);
      tasks.push({ segments: contextSegments, targetIds });
      cursor = chunkEndCursor + 1;
    }
  }

  return tasks;
}

export function applySubtitleEdit(segment: SubtitleSegment, draft: SubtitleEditDraft):
  | { ok: true; segment: SubtitleSegment; sourceChanged: boolean }
  | { ok: false; error: string } {
  const start = Number(draft.start);
  const end = Number(draft.end);
  const text = draft.text.trim();
  const translatedText = draft.translatedText.trim();

  if (!text) return { ok: false, error: "Эх хадмал хоосон байж болохгүй." };
  if (text.length > MAX_SUBTITLE_TEXT_LENGTH || translatedText.length > MAX_SUBTITLE_TEXT_LENGTH) {
    return { ok: false, error: "Хадмалын нэг мөр 3000 тэмдэгтээс хэтэрч болохгүй." };
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
    return { ok: false, error: "Хадмалын эхлэх/дуусах хугацаа зөв биш байна. Дуусах хугацаа эхлэхээс хойш байх ёстой." };
  }

  const sourceChanged = text !== segment.text;
  return {
    ok: true,
    sourceChanged,
    segment: {
      ...segment,
      start,
      end,
      text,
      translatedText: sourceChanged ? undefined : translatedText || undefined,
    },
  };
}

const TIME_RANGE = /^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s+-->\s+(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})(?:\s+.*)?$/;

function toSeconds(hours: string, minutes: string, seconds: string, milliseconds: string) {
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds) + Number(milliseconds.padEnd(3, "0")) / 1000;
}

function stripMarkup(value: string) {
  return value.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

export function parseSubtitle(content: string, filename: string): ParseSubtitleResult {
  const extension = filename.split(".").pop()?.toLowerCase();
  if (extension !== "srt" && extension !== "vtt") return { ok: false, error: "Зөвхөн .srt эсвэл .vtt файл сонгоно уу." };
  if (!content.trim()) return { ok: false, error: "Хадмалын файл хоосон байна." };

  const normalized = content.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  if (extension === "vtt" && !lines[0]?.trim().startsWith("WEBVTT")) return { ok: false, error: "VTT файл WEBVTT толгой мөргүй байна." };

  const segments: SubtitleSegment[] = [];
  const seen = new Set<string>();
  let skippedDuplicates = 0;
  let cueIndex = 0;

  for (let index = 0; index < lines.length;) {
    const line = lines[index].trim();
    if (!line || line === "WEBVTT" || line.startsWith("NOTE") || line.startsWith("STYLE") || line.startsWith("REGION")) { index += 1; continue; }
    if (/^\d+$/.test(line)) { index += 1; continue; }

    const match = line.match(TIME_RANGE);
    if (!match) { index += 1; continue; }
    const start = toSeconds(match[1], match[2], match[3], match[4]);
    const end = toSeconds(match[5], match[6], match[7], match[8]);
    index += 1;
    const textLines: string[] = [];
    while (index < lines.length && lines[index].trim()) textLines.push(lines[index++]);
    const text = stripMarkup(textLines.join(" "));

    if (!text || end <= start) continue;
    if (text.length > MAX_SUBTITLE_TEXT_LENGTH) return { ok: false, error: "Нэг хадмалын мөр хэт урт байна." };
    const duplicateKey = `${start.toFixed(3)}-${end.toFixed(3)}-${text.toLowerCase()}`;
    if (seen.has(duplicateKey)) { skippedDuplicates += 1; continue; }
    seen.add(duplicateKey);
    segments.push({ id: `cue-${cueIndex++}`, start, end, text });
  }

  if (!segments.length) return { ok: false, error: "Унших боломжтой хугацаа болон тексттэй хадмал олдсонгүй." };
  return { ok: true, segments, skippedDuplicates };
}

export function formatTimestamp(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60).toString().padStart(2, "0");
  const remaining = (total % 60).toString().padStart(2, "0");
  return `${minutes}:${remaining}`;
}

function formatVttTimestamp(seconds: number) {
  const totalMilliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(totalMilliseconds / 3_600_000).toString().padStart(2, "0");
  const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000).toString().padStart(2, "0");
  const remainingSeconds = Math.floor((totalMilliseconds % 60_000) / 1000).toString().padStart(2, "0");
  const milliseconds = (totalMilliseconds % 1000).toString().padStart(3, "0");
  return `${hours}:${minutes}:${remainingSeconds}.${milliseconds}`;
}

export function formatTranslatedVtt(segments: readonly SubtitleSegment[]) {
  if (!segments.length) {
    throw new Error("VTT файл үүсгэхийн өмнө бүх хадмалын мөрийг орчуулна уу.");
  }

  const cues = segments.map(({ id, start, end, translatedText }) => {
    if (!translatedText?.trim()) {
      throw new Error("VTT файл үүсгэхийн өмнө бүх хадмалын мөрийг орчуулна уу.");
    }
    const safeText = translatedText.trim()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return `${id}\n${formatVttTimestamp(start)} --> ${formatVttTimestamp(end)}\n${safeText}`;
  });

  return `WEBVTT\n\n${cues.join("\n\n")}\n`;
}
