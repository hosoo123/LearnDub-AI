import { spawn } from "node:child_process";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { SubtitleSegment } from "./subtitle-parser";

export const MAX_TRANSCRIPTION_VIDEO_BYTES = 250 * 1024 * 1024;
const MAX_DURATION_SECONDS = 30 * 60;
const SAMPLE_RATE = 16_000;
const MAX_AUDIO_BYTES = MAX_DURATION_SECONDS * SAMPLE_RATE * 4;
const MODEL_CACHE_DIR = path.join(os.homedir(), ".cache", "learndub-ai", "whisper");

type WhisperChunk = { text: string; timestamp: [number | null, number | null] };

export class TranscriptionError extends Error {}

function isWhisperChunk(value: unknown): value is WhisperChunk {
  if (typeof value !== "object" || value === null || !("text" in value) || typeof value.text !== "string" || !("timestamp" in value)) return false;
  const { timestamp } = value;
  return Array.isArray(timestamp)
    && timestamp.length === 2
    && timestamp.every((time) => time === null || typeof time === "number");
}

function parseWhisperChunks(output: string): WhisperChunk[] {
  let result: unknown;
  try {
    result = JSON.parse(output);
  } catch {
    throw new TranscriptionError("Whisper таних үр дүнг уншиж чадсангүй.");
  }
  if (typeof result !== "object" || result === null || !("chunks" in result) || !Array.isArray(result.chunks) || !result.chunks.every(isWhisperChunk)) {
    throw new TranscriptionError("Whisper таних үр дүнгийн формат буруу байна.");
  }
  return result.chunks;
}

function runProcess(command: string, args: string[], timeoutMs: number, processName = path.basename(command)) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill();
      reject(new TranscriptionError(`${processName} хугацаандаа дууссангүй.`));
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.on("data", (chunk: string) => { stderr = (stderr + chunk).slice(-8_000); });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(new TranscriptionError(`${processName} ажиллуулах боломжгүй байна. (${error.message})`));
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve(stdout.trim());
      else reject(new TranscriptionError(`${processName} ажиллагаанд алдаа гарлаа.${stderr ? ` ${stderr.trim()}` : ""}`));
    });
  });
}

export function chunksToSubtitleSegments(chunks: WhisperChunk[]): SubtitleSegment[] {
  let index = 0;
  const seen = new Set<string>();
  return chunks.flatMap(({ text, timestamp }) => {
    const normalizedText = text.replace(/\s+/g, " ").trim();
    const [start, end] = timestamp;
    if (!normalizedText || start === null || end === null || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) return [];
    const key = `${start}-${end}-${normalizedText}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ id: `cue-${index++}`, start, end, text: normalizedText }];
  }).sort((a, b) => a.start - b.start || a.end - b.end);
}

export async function transcribeVideo(file: File, quality: "fast" | "accurate" = "fast"): Promise<SubtitleSegment[]> {
  if (!file.size) throw new TranscriptionError("Видео файл хоосон байна.");
  if (file.size > MAX_TRANSCRIPTION_VIDEO_BYTES) throw new TranscriptionError("Яриа таних видео 250 MB-аас бага байх ёстой.");
  if (!/\.(mp4|webm)$/i.test(file.name)) throw new TranscriptionError("Яриа танихад зөвхөн MP4 эсвэл WebM видео дэмжинэ.");

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "learndub-whisper-"));
  const videoPath = path.join(tempDir, `source${path.extname(file.name).toLowerCase()}`);
  const audioPath = path.join(tempDir, "audio.f32le");
  const ffprobe = process.env.FFPROBE_PATH || (process.platform === "win32" ? "ffprobe.exe" : "ffprobe");
  const ffmpeg = process.env.FFMPEG_PATH || (process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");

  try {
    await writeFile(videoPath, new Uint8Array(await file.arrayBuffer()));
    const durationText = await runProcess(ffprobe, [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      videoPath,
    ], 30_000);
    const duration = Number(durationText);
    if (!Number.isFinite(duration) || duration <= 0) throw new TranscriptionError("Видео үргэлжлэх хугацааг уншиж чадсангүй.");
    if (duration > MAX_DURATION_SECONDS) throw new TranscriptionError("Одоогоор 30 минутаас урт видеог нэг удаад таних боломжгүй.");

    await runProcess(ffmpeg, [
      "-v", "error",
      "-i", videoPath,
      "-vn",
      "-ac", "1",
      "-ar", String(SAMPLE_RATE),
      "-f", "f32le",
      "-acodec", "pcm_f32le",
      "-y", audioPath,
    ], 5 * 60_000);

    const audioStats = await stat(audioPath);
    if (!audioStats.size || audioStats.size > MAX_AUDIO_BYTES) {
      throw new TranscriptionError("Видеоноос ашиглах аудио гаргаж чадсангүй.");
    }
    if (audioStats.size % 4 !== 0) throw new TranscriptionError("Аудио өгөгдлийн формат буруу байна.");

    const workerPath = path.join(process.cwd(), "scripts", "transcribe-worker.mjs");
    const workerOutput = await runProcess(process.execPath, [
      workerPath,
      audioPath,
      quality === "accurate" ? (process.env.WHISPER_ACCURATE_MODEL || "onnx-community/whisper-base.en")
        : (process.env.WHISPER_MODEL || "onnx-community/whisper-tiny.en"),
      MODEL_CACHE_DIR,
    ], 25 * 60_000, "Whisper");
    const segments = chunksToSubtitleSegments(parseWhisperChunks(workerOutput));
    if (!segments.length) throw new TranscriptionError("Яриа таньж чадсангүй. Видео дуугүй эсвэл дэмжигдээгүй байж магадгүй.");
    return segments;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
