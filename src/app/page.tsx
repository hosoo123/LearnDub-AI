"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applySubtitleEdit, buildMissingTranslationTasks, formatTimestamp, formatTranslatedVtt, MAX_SUBTITLE_FILE_BYTES, MAX_SUBTITLE_TEXT_LENGTH, parseSubtitle, SubtitleSegment } from "@/lib/subtitle-parser";
import { deleteSavedLesson, listSavedLessons, loadSavedLesson, saveLesson, saveLessonVideo, SavedLesson } from "@/lib/lesson-store";
import { duckVideoAudio, MONGOLIAN_TTS_VOICES, isMongolianTtsVoice, type MongolianTtsVoice } from "@/lib/speech";
import { detectTranslationStyle, type TranslationMode } from "@/lib/translation-style";

const MAX_VIDEO_FILE_BYTES = 250 * 1024 * 1024;
const TRANSLATION_BATCH_SIZE = 8;
const SPEECH_DUCKED_VIDEO_VOLUME = 0.12;

type SegmentDraft = {
  start: string;
  end: string;
  text: string;
  translatedText: string;
};

function formatSavedAt(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const subtitleInputRef = useRef<HTMLInputElement>(null);
  const spokenSegmentIdRef = useRef<string | undefined>(undefined);
  const speechAbortControllerRef = useRef<AbortController | undefined>(undefined);
  const speechAudioRef = useRef<HTMLAudioElement>(null);
  const speechRequestIdRef = useRef(0);
  const speechVideoVolumeRef = useRef<{ video: HTMLVideoElement; restore: () => void } | undefined>(undefined);
  const restoreTimeRef = useRef(0);
  const lastProgressSavedAtRef = useRef(0);
  const [videoFile, setVideoFile] = useState<File>();
  const [videoUrl, setVideoUrl] = useState<string>();
  const [videoName, setVideoName] = useState<string>();
  const [subtitleName, setSubtitleName] = useState<string>();
  const [lessonId, setLessonId] = useState<string>();
  const [savedLessons, setSavedLessons] = useState<SavedLesson[]>([]);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isLibraryReady, setIsLibraryReady] = useState(false);
  const [isSavingLesson, setIsSavingLesson] = useState(false);
  const [segments, setSegments] = useState<SubtitleSegment[]>([]);
  const [translationMode, setTranslationMode] = useState<TranslationMode>("auto");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [speechVoice, setSpeechVoice] = useState<MongolianTtsVoice>(MONGOLIAN_TTS_VOICES.bataa);
  const [speechEnabled, setSpeechEnabled] = useState(false);
  const [speechStatus, setSpeechStatus] = useState<"idle" | "loading" | "playing">("idle");
  const [speechError, setSpeechError] = useState<string>();
  const [editingSegmentId, setEditingSegmentId] = useState<string>();
  const [segmentDraft, setSegmentDraft] = useState<SegmentDraft>();
  const [message, setMessage] = useState("Видео болон хадмал файл сонгож эхлээрэй.");
  const [error, setError] = useState<string>();
  const detectedTranslationStyle = useMemo(
    () => detectTranslationStyle(segments, [videoName, subtitleName]),
    [segments, subtitleName, videoName],
  );
  const translationStyle = translationMode === "auto" ? detectedTranslationStyle : translationMode;
  const allSegmentsTranslated = segments.length > 0 && segments.every((segment) => Boolean(segment.translatedText?.trim()));
  const missingTranslationCount = segments.filter((segment) => !segment.translatedText?.trim()).length;

  const restoreSpeechVideoVolume = useCallback(() => {
    const previous = speechVideoVolumeRef.current;
    if (!previous) return;
    if (previous.video === videoRef.current) previous.restore();
    speechVideoVolumeRef.current = undefined;
  }, []);

  const duckVideoForSpeech = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.muted) return;
    if (speechVideoVolumeRef.current?.video === video) return;
    restoreSpeechVideoVolume();
    const restore = duckVideoAudio(video, SPEECH_DUCKED_VIDEO_VOLUME);
    if (restore) speechVideoVolumeRef.current = { video, restore };
  }, [restoreSpeechVideoVolume]);

  useEffect(() => () => { if (videoUrl) URL.revokeObjectURL(videoUrl); }, [videoUrl]);
  const activeSegment = useMemo(() => segments.find((segment) => currentTime >= segment.start && currentTime < segment.end), [segments, currentTime]);
  const activeSegmentIndex = activeSegment ? segments.findIndex((segment) => segment.id === activeSegment.id) : -1;

  useEffect(() => {
    let cancelled = false;
    async function restoreLastLesson() {
      try {
        const lessons = await listSavedLessons();
        if (cancelled) return;
        setSavedLessons(lessons);
        const lastLessonId = window.localStorage.getItem("learndub-current-lesson");
        const loaded = lastLessonId ? await loadSavedLesson(lastLessonId) : undefined;
        if (cancelled || !loaded) return;
        setLessonId(loaded.lesson.id);
        setVideoName(loaded.lesson.videoName);
        setSubtitleName(loaded.lesson.subtitleName);
        setSegments(loaded.lesson.segments);
        setDuration(loaded.lesson.duration);
        setCurrentTime(loaded.lesson.currentTime);
        restoreTimeRef.current = loaded.lesson.currentTime;
        if (loaded.video && loaded.lesson.videoName) {
          const restoredFile = new File([loaded.video], loaded.lesson.videoName, { type: loaded.video.type });
          setVideoFile(restoredFile);
          setVideoUrl(URL.createObjectURL(loaded.video));
        }
        setMessage("Сүүлд ашигласан хичээлийг локал сангаас сэргээлээ.");
      } catch (restoreError) {
        if (!cancelled) setError(restoreError instanceof Error ? restoreError.message : "Локал хичээлийн санг нээж чадсангүй.");
      } finally {
        if (!cancelled) setIsLibraryReady(true);
      }
    }
    void restoreLastLesson();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!isLibraryReady || !lessonId || (!videoName && !subtitleName && !segments.length)) return;
    const timer = window.setTimeout(async () => {
      const lesson: SavedLesson = {
        id: lessonId,
        ...(videoName ? { videoName } : {}),
        ...(subtitleName ? { subtitleName } : {}),
        segments,
        duration,
        currentTime,
        updatedAt: Date.now(),
      };
      setIsSavingLesson(true);
      try {
        await saveLesson(lesson);
        window.localStorage.setItem("learndub-current-lesson", lessonId);
        setSavedLessons(await listSavedLessons());
      } catch (saveError) {
        setError(saveError instanceof Error ? `${saveError.message} Төхөөрөмжийн сул зай эсвэл browser-ийн хадгалалтын хязгаарыг шалгана уу.` : "Хичээлийг локал санд хадгалж чадсангүй.");
      } finally {
        setIsSavingLesson(false);
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [currentTime, duration, isLibraryReady, lessonId, segments, subtitleName, videoName]);

  useEffect(() => {
    if (!isPlaying || !lessonId) return;
    const now = Date.now();
    if (now - lastProgressSavedAtRef.current < 5_000) return;
    lastProgressSavedAtRef.current = now;
    void saveLesson({
      id: lessonId,
      ...(videoName ? { videoName } : {}),
      ...(subtitleName ? { subtitleName } : {}),
      segments,
      duration,
      currentTime,
      updatedAt: now,
    }).catch((saveError) => {
      setError(saveError instanceof Error ? `Үзсэн хугацааг хадгалж чадсангүй: ${saveError.message}` : "Үзсэн хугацааг хадгалж чадсангүй.");
    });
  }, [currentTime, duration, isPlaying, lessonId, segments, subtitleName, videoName]);

  useEffect(() => {
    if (!speechEnabled || !isPlaying || !activeSegment?.translatedText?.trim()) return;
    if (spokenSegmentIdRef.current === activeSegment.id) return;
    speechAbortControllerRef.current?.abort();
    speechAudioRef.current?.pause();
    speechAudioRef.current = null;
    const controller = new AbortController();
    speechAbortControllerRef.current = controller;
    const requestId = ++speechRequestIdRef.current;
    spokenSegmentIdRef.current = activeSegment.id;
    setSpeechStatus("loading");
    setSpeechError(undefined);
    void (async () => {
      try {
        const response = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: activeSegment.translatedText, sourceText: activeSegment.text, voice: speechVoice }),
          signal: controller.signal,
        });
        const result: unknown = await response.json();
        if (!response.ok) {
          const message = typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
            ? result.error
            : "Монгол дуу үүсгэж чадсангүй.";
          throw new Error(message);
        }
        if (typeof result !== "object" || result === null || !("audioUrl" in result)
          || typeof result.audioUrl !== "string" || !result.audioUrl.startsWith("data:audio/mpeg;base64,")) {
          throw new Error("Монгол дууны үйлчилгээ буруу аудио өгөгдөл буцаалаа.");
        }
        if (requestId !== speechRequestIdRef.current) return;
        const audio = new Audio(result.audioUrl);
        speechAudioRef.current = audio;
        audio.onloadedmetadata = () => {
          if (requestId === speechRequestIdRef.current && Number.isFinite(audio.duration)) {
            const cueDuration = Math.max(0.5, activeSegment.end - activeSegment.start);
            audio.playbackRate = Math.min(1.35, Math.max(1, audio.duration / cueDuration));
          }
        };
        audio.onended = () => {
          if (requestId === speechRequestIdRef.current) {
            restoreSpeechVideoVolume();
            setSpeechStatus("idle");
          }
        };
        audio.onerror = () => {
          if (requestId === speechRequestIdRef.current) {
            restoreSpeechVideoVolume();
            setSpeechStatus("idle");
            setSpeechError("Үүсгэсэн дууг тоглуулж чадсангүй.");
          }
        };
        duckVideoForSpeech();
        await audio.play();
        if (requestId === speechRequestIdRef.current) setSpeechStatus("playing");
      } catch (speechFailure) {
        if (controller.signal.aborted || requestId !== speechRequestIdRef.current) return;
        restoreSpeechVideoVolume();
        setSpeechStatus("idle");
        setSpeechError(speechFailure instanceof Error ? speechFailure.message : "Монгол дуу үүсгэхэд алдаа гарлаа.");
      }
    })();
    return () => {
      controller.abort();
      if (speechAbortControllerRef.current === controller) speechAbortControllerRef.current = undefined;
      if (requestId === speechRequestIdRef.current) {
        speechRequestIdRef.current += 1;
        speechAudioRef.current?.pause();
        speechAudioRef.current = null;
        restoreSpeechVideoVolume();
        setSpeechStatus("idle");
      }
    };
  }, [activeSegment, duckVideoForSpeech, isPlaying, restoreSpeechVideoVolume, speechEnabled, speechVoice]);

  useEffect(() => () => {
    speechAbortControllerRef.current?.abort();
    speechAudioRef.current?.pause();
    restoreSpeechVideoVolume();
  }, [restoreSpeechVideoVolume]);

  async function onVideoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setError(undefined);
    if (!/\.(mp4|webm)$/i.test(file.name)) { setError("Зөвхөн .mp4 эсвэл .webm видео файл сонгоно уу."); return; }
    if (file.size > MAX_VIDEO_FILE_BYTES) { setError("Видео файл 250 MB-аас ихгүй байх ёстой."); return; }
    const id = crypto.randomUUID();
    setLessonId(id);
    restoreTimeRef.current = 0;
    setVideoUrl((previous) => { if (previous) URL.revokeObjectURL(previous); return URL.createObjectURL(file); });
    setVideoFile(file);
    setVideoName(file.name);
    setSegments([]);
    setTranslationMode("auto");
    cancelSegmentEdit();
    setSubtitleName(undefined);
    setMessage("Видео бэлэн боллоо. Одоо .srt эсвэл .vtt хадмал оруулна уу.");
    try {
      await saveLessonVideo(id, file);
    } catch (saveError) {
      setError(saveError instanceof Error ? `${saveError.message} Энэ видеог браузерт хадгалж чадсангүй.` : "Видео локал санд хадгалагдсангүй.");
    }
  }

  async function onSubtitleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setError(undefined);
    if (file.size > MAX_SUBTITLE_FILE_BYTES) { setError("Хадмалын файл 1 MB-аас ихгүй байх ёстой."); return; }
    let result: ReturnType<typeof parseSubtitle>;
    try {
      result = parseSubtitle(await file.text(), file.name);
    } catch (readError) {
      setError(readError instanceof Error ? `Хадмалын файлыг уншиж чадсангүй: ${readError.message}` : "Хадмалын файлыг уншиж чадсангүй.");
      return;
    }
    if (!result.ok) { setError(result.error); return; }
    if (!lessonId) setLessonId(crypto.randomUUID());
    setSegments(result.segments);
    setTranslationMode("auto");
    cancelSegmentEdit();
    setSubtitleName(file.name);
    setMessage(`${result.segments.length} хадмалын мөр амжилттай уншигдлаа.${result.skippedDuplicates ? ` ${result.skippedDuplicates} давхардсан мөр алгасагдлаа.` : ""}`);
  }

  async function loadDemoLesson() {
    const demoSubtitle = `1
00:00:01,000 --> 00:00:04,000
Welcome to the lesson.

2
00:00:04,000 --> 00:00:07,000
Today we will learn the basics of speaking clearly.

3
00:00:07,000 --> 00:00:10,000
Listen carefully and repeat each sentence.
`;
    const result = parseSubtitle(demoSubtitle, "demo-lesson.srt");
    if (!result.ok) {
      setError(result.error);
      return;
    }
    stopSpeech();
    videoRef.current?.pause();
    setIsPlaying(false);
    setSegments(result.segments);
    setTranslationMode("auto");
    cancelSegmentEdit();
    setLessonId(crypto.randomUUID());
    setSubtitleName("demo-lesson.srt");
    setVideoUrl((previous) => { if (previous) URL.revokeObjectURL(previous); return undefined; });
    setVideoFile(undefined);
    setVideoName(undefined);
    setDuration(0);
    setCurrentTime(0);
    restoreTimeRef.current = 0;
    setMessage("Демо хичээлийн хадмал ачаалагдлаа. Одоо орчуулга болон засварыг туршиж үзээрэй.");
  }

  function startNewLesson() {
    stopSpeech();
    videoRef.current?.pause();
    setIsPlaying(false);
    setLessonId(undefined);
    setVideoUrl((previous) => { if (previous) URL.revokeObjectURL(previous); return undefined; });
    setVideoFile(undefined);
    setVideoName(undefined);
    setSubtitleName(undefined);
    setSegments([]);
    setTranslationMode("auto");
    setCurrentTime(0);
    setDuration(0);
    restoreTimeRef.current = 0;
    cancelSegmentEdit();
    setError(undefined);
    setMessage("Шинэ хичээл эхлүүлэхэд бэлэн.");
    try {
      window.localStorage.removeItem("learndub-current-lesson");
    } catch (storageError) {
      setError(storageError instanceof Error ? `Сүүлд нээсэн хичээлийг цэвэрлэж чадсангүй: ${storageError.message}` : "Сүүлд нээсэн хичээлийн төлөвийг цэвэрлэж чадсангүй.");
    }
  }

  async function openSavedLesson(id: string) {
    try {
      const loaded = await loadSavedLesson(id);
      if (!loaded) throw new Error("Сонгосон хичээл локал санд олдсонгүй.");
      stopSpeech();
      videoRef.current?.pause();
      setIsPlaying(false);
      setLessonId(loaded.lesson.id);
      setTranslationMode("auto");
      setVideoName(loaded.lesson.videoName);
      setSubtitleName(loaded.lesson.subtitleName);
      setSegments(loaded.lesson.segments);
      setDuration(loaded.lesson.duration);
      setCurrentTime(loaded.lesson.currentTime);
      restoreTimeRef.current = loaded.video ? loaded.lesson.currentTime : 0;
      setVideoUrl((previous) => { if (previous) URL.revokeObjectURL(previous); return loaded.video ? URL.createObjectURL(loaded.video) : undefined; });
      setVideoFile(loaded.video && loaded.lesson.videoName
        ? new File([loaded.video], loaded.lesson.videoName, { type: loaded.video.type })
        : undefined);
      setIsLibraryOpen(false);
      setError(undefined);
      setMessage("Хичээлийг локал сангаас нээлээ.");
      window.localStorage.setItem("learndub-current-lesson", id);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Хичээлийг нээж чадсангүй.");
    }
  }

  async function removeSavedLesson(id: string) {
    const lesson = savedLessons.find((item) => item.id === id);
    if (!lesson || !window.confirm(`“${lesson.videoName ?? lesson.subtitleName ?? "Хадмалын хичээл"}” хичээлийг локал сангаас устгах уу?`)) return;
    try {
      await deleteSavedLesson(id);
      if (lessonId === id) startNewLesson();
      if (window.localStorage.getItem("learndub-current-lesson") === id) {
        window.localStorage.removeItem("learndub-current-lesson");
      }
      setSavedLessons(await listSavedLessons());
      setError(undefined);
      setMessage("Хичээлийг локал сангаас устгалаа.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Хичээлийг устгаж чадсангүй.");
    }
  }

  function downloadTranslatedVtt() {
    try {
      const content = formatTranslatedVtt(segments);
      const blobUrl = URL.createObjectURL(new Blob([content], { type: "text/vtt;charset=utf-8" }));
      const link = document.createElement("a");
      const baseName = (subtitleName ?? videoName ?? "subtitles").replace(/\.(srt|vtt)$/i, "").replace(/\.mp4$/i, "").replace(/\.webm$/i, "");
      link.href = blobUrl;
      link.download = `${baseName}.mn.vtt`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      setError(undefined);
      setMessage("Орчуулсан VTT хадмал татагдлаа.");
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "VTT файл үүсгэхэд алдаа гарлаа.");
    }
  }

  function syncTime() {
    const video = videoRef.current;
    if (!video) return;
    setCurrentTime(video.currentTime);
  }
  function stopSpeech() {
    speechAbortControllerRef.current?.abort();
    speechAbortControllerRef.current = undefined;
    speechAudioRef.current?.pause();
    speechAudioRef.current = null;
    restoreSpeechVideoVolume();
    speechRequestIdRef.current += 1;
    spokenSegmentIdRef.current = undefined;
    setSpeechStatus("idle");
  }
  function seekTo(segment: SubtitleSegment) { if (!videoRef.current) return; stopSpeech(); videoRef.current.currentTime = segment.start; syncTime(); }
  function getAdjacentSegmentIndex(direction: -1 | 1) {
    if (activeSegmentIndex >= 0) return activeSegmentIndex + direction;
    if (direction === 1) return segments.findIndex((segment) => segment.start > currentTime);
    for (let index = segments.length - 1; index >= 0; index -= 1) {
      if (segments[index].start < currentTime) return index;
    }
    return -1;
  }
  function navigateSegment(direction: -1 | 1) {
    const targetIndex = getAdjacentSegmentIndex(direction);
    const target = segments[targetIndex];
    if (target) seekTo(target);
  }
  function editSegment(segment: SubtitleSegment) {
    setEditingSegmentId(segment.id);
    setSegmentDraft({
      start: String(segment.start),
      end: String(segment.end),
      text: segment.text,
      translatedText: segment.translatedText ?? "",
    });
    setError(undefined);
  }
  function cancelSegmentEdit() {
    setEditingSegmentId(undefined);
    setSegmentDraft(undefined);
  }
  function saveSegmentEdit(event: FormEvent<HTMLFormElement>, segment: SubtitleSegment) {
    event.preventDefault();
    if (!segmentDraft) return;
    const result = applySubtitleEdit(segment, segmentDraft);
    if (!result.ok) { setError(result.error); return; }
    setSegments((current) => current.map((item) => item.id === segment.id ? result.segment : item));
    setError(undefined);
    setMessage(result.sourceChanged
      ? "Эх хадмал засагдлаа. Өөрчлөгдсөн мөрийн орчуулгыг дахин хийнэ үү."
      : "Хадмалын засвар хадгалагдлаа.");
    cancelSegmentEdit();
  }
  async function togglePlay() { if (!videoRef.current) return; if (videoRef.current.paused) await videoRef.current.play(); else videoRef.current.pause(); }
  async function transcribeVideo() {
    if (!videoFile || isTranscribing) return;
    setIsTranscribing(true);
    setError(undefined);
    setMessage("Видеоноос аудио гаргаж, Whisper загвараар яриаг таньж байна. Анх удаа Whisper загварыг татаж магадгүй.");
    try {
      const response = await fetch("/api/transcribe", {
        method: "POST",
        headers: {
          "Content-Type": videoFile.type || "application/octet-stream",
          "X-File-Name": encodeURIComponent(videoFile.name),
        },
        body: videoFile,
      });
      const data = await response.json() as {
        segments?: SubtitleSegment[];
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? "Видеоны яриаг таньж чадсангүй.");
      if (!Array.isArray(data.segments) || !data.segments.length
        || data.segments.some((segment) => typeof segment.id !== "string"
          || typeof segment.text !== "string"
          || typeof segment.start !== "number"
          || typeof segment.end !== "number"
          || segment.end <= segment.start)) {
        throw new Error("Whisper таньсан яриаг хугацаатай хадмал болгон буцаасангүй.");
      }
      setSegments(data.segments);
      setTranslationMode("auto");
      cancelSegmentEdit();
      setSubtitleName(videoName?.replace(/\.(mp4|webm)$/i, ".en.vtt"));
      setMessage(`${data.segments.length} англи хадмалын мөрийг ярианаас танилаа. Одоо “Бүгдийг орчуулах” товч дарна уу.`);
    } catch (transcriptionError) {
      setError(transcriptionError instanceof Error ? transcriptionError.message : "Яриа танихад алдаа гарлаа.");
    } finally {
      setIsTranscribing(false);
    }
  }

  async function translateAll() {
    if (!missingTranslationCount || isTranslating) return;
    setIsTranslating(true); setError(undefined);
    try {
      const tasks = buildMissingTranslationTasks(segments, TRANSLATION_BATCH_SIZE);
      const translatedById = new Map<string, string>();
      let completed = 0;
      for (const task of tasks) {
        const batchIds = new Set(task.segments.map(({ id }) => id));
        setMessage(`Ойролцоох мөрүүдийн контекстээр дутууг орчуулж байна… ${completed}/${missingTranslationCount}`);
        const response = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            style: translationStyle,
            segments: task.segments.map(({ id, text, translatedText }) => ({
              id,
              text,
              ...(translatedText?.trim() ? { contextTranslation: translatedText } : {}),
            })),
          }),
        });
        const data = await response.json() as {
          translatedSegments?: Array<{ id: string; translatedText: string }>;
          message?: string;
          error?: string;
        };
        if (!response.ok) throw new Error(data.error ?? "Орчуулгын хүсэлт амжилтгүй боллоо.");
        if (!Array.isArray(data.translatedSegments) || data.translatedSegments.length !== task.segments.length) {
          throw new Error("Орчуулгын үйлчилгээ хадмалын мөр бүрд зөв хариу өгсөнгүй.");
        }
        const translatedBatchIds = new Set<string>();
        for (const translation of data.translatedSegments) {
          if (typeof translation !== "object" || translation === null
            || typeof translation.id !== "string" || typeof translation.translatedText !== "string"
            || !batchIds.has(translation.id) || translatedBatchIds.has(translation.id) || !translation.translatedText.trim()) {
            throw new Error("Орчуулгын үйлчилгээний мөрийн дугаар буруу байна.");
          }
          translatedBatchIds.add(translation.id);
          if (task.targetIds.includes(translation.id)) translatedById.set(translation.id, translation.translatedText);
        }
        if (task.segments.some(({ id }) => !translatedBatchIds.has(id))
          || task.targetIds.some((id) => !translatedById.has(id))) {
          throw new Error("Зарим хадмалын мөр орчуулгагүй үлдлээ.");
        }
        completed += task.targetIds.length;
        setSegments((current) => current.map((segment) => {
          const translatedText = translatedById.get(segment.id);
          return translatedText ? { ...segment, translatedText } : segment;
        }));
      }
      setMessage(translationStyle === "song"
        ? `${missingTranslationCount} дутуу дууны мөрийг дүрслэл, утга, давталтыг нь хадгалж орчууллаа. Дуулж тааруулахдаа хэмнэлийг нягтлаарай.`
        : `${missingTranslationCount} дутуу мөрийг ойролцоох контекстээр орчууллаа. Таны өмнөх орчуулгууд хэвээр үлдлээ.`);
    } catch (translationError) { setError(translationError instanceof Error ? translationError.message : "Орчуулга амжилтгүй боллоо."); }
    finally { setIsTranslating(false); }
  }

  return <main className="app-shell">
    <aside className="sidebar"><a className="brand" href="#home"><span className="brand-mark">L<span>·</span></span><span>learndub<span className="brand-ai"> AI</span></span></a><div className="sidebar-label">АЖИЛЛАГАА</div><a className="nav-item active" href="#studio"><span className="nav-icon">◫</span> Суралцах студи</a><button type="button" className={`nav-item library-nav ${isLibraryOpen ? "active" : ""}`} disabled={!isLibraryReady} onClick={() => setIsLibraryOpen((open) => !open)} aria-expanded={isLibraryOpen}><span className="nav-icon">▤</span> Миний сан <span className="soon">{savedLessons.length}</span></button><div className="sidebar-bottom"><div className="help-card"><span className="help-spark">✳</span><strong>Зөвшөөрөлтэй контент ашиглана уу</strong><p>Өөрийн эсвэл ашиглах эрхтэй видео, хадмал файл л оруулна.</p></div><div className="profile"><div className="avatar">С</div><div><strong>Суралцагч</strong><span>Үнэгүй демо</span></div></div></div></aside>
    <section className="main-area" id="home"><header className="topbar"><div className="breadcrumb">Суралцах студи <span>/</span> <strong>Хичээл үзэх</strong></div><div className="topbar-right"><span className="demo-pill"><i /> Локал хувилбар</span><button className="avatar top-avatar" aria-label="Хэрэглэгч">С</button></div></header>
      <div className="content" id="studio"><div className="welcome-row"><div><div className="eyebrow"><span>ӨӨРИЙН ХЭМНЭЛЭЭР СУР</span><span className="eyebrow-line" /></div><h1>Суралцах студи <span className="wave-emoji">👋</span></h1><p className="intro">Видео болон хадмал оруулж, хугацаатай нь дагаж үзээрэй.</p></div></div>
        <div className={`notice ${error ? "notice-error" : ""}`} role={error ? "alert" : "status"} aria-live="polite"><span className="notice-icon">{error ? "!" : "i"}</span><p><strong>{error ? "Үйлдэл амжилтгүй" : isSavingLesson ? "Хичээл хадгалж байна" : isLibraryReady ? "Локал хадгалалт" : "Хичээл ачаалж байна"}</strong><span>{error ?? (isSavingLesson ? "Энэ төхөөрөмжид автоматаар хадгалж байна…" : message)}</span></p></div>
        {isLibraryOpen && <section className="library-panel" id="library" aria-label="Миний хичээлүүд"><div className="library-heading"><div><h2>Миний хичээлүүд</h2><p>Энэ төхөөрөмжид хувийн байдлаар хадгалагдана.</p></div><button type="button" className="import-button" onClick={() => { startNewLesson(); setIsLibraryOpen(false); }}>Шинэ хичээл</button></div>{!isLibraryReady ? <p className="library-empty">Хичээлүүдийг уншиж байна…</p> : savedLessons.length ? <div className="library-list">{savedLessons.map((lesson) => <article className="library-item" key={lesson.id}><button type="button" className="library-open" onClick={() => void openSavedLesson(lesson.id)}><strong>{lesson.videoName ?? lesson.subtitleName ?? "Хадмалын хичээл"}</strong><span>{lesson.segments.length} мөр · {lesson.segments.filter((segment) => segment.translatedText?.trim()).length} орчуулсан · {formatSavedAt(lesson.updatedAt)}</span></button><button type="button" className="library-delete" onClick={() => void removeSavedLesson(lesson.id)} aria-label={`${lesson.videoName ?? lesson.subtitleName ?? "Хичээл"} устгах`}>Устгах</button></article>)}</div> : <p className="library-empty">Одоогоор хадгалсан хичээл алга. Видео, хадмал оруулах эсвэл демо хичээлээс эхлээрэй.</p>}</section>}
        <section className="import-card" aria-label="Файл оруулах"><div><span className="upload-kicker">АЛХАМ 1</span><h2>Хичээлийн файлаа оруулна уу</h2><p>Видео: MP4, WebM · Хадмал: SRT, VTT · Таны файл энэ төхөөрөмжөөс гарахгүй.</p></div><div className="import-actions"><button disabled={!isLibraryReady || isTranscribing || isTranslating} onClick={() => videoInputRef.current?.click()} className="import-button">{videoName ? "Видео солих" : "Видео сонгох"}</button><button disabled={!isLibraryReady || isTranscribing || isTranslating} onClick={() => subtitleInputRef.current?.click()} className="import-button secondary">Хадмал оруулах</button><button type="button" disabled={!isLibraryReady} onClick={loadDemoLesson} className="import-button ghost">Демо жишээ</button><button type="button" disabled={!isLibraryReady} onClick={() => setIsLibraryOpen((open) => !open)} className="import-button ghost">Миний сан ({savedLessons.length})</button>{lessonId && <button type="button" onClick={startNewLesson} className="import-button ghost">Шинэ хичээл</button>}<input ref={videoInputRef} onChange={onVideoChange} accept="video/mp4,video/webm,.mp4,.webm" type="file" hidden/><input ref={subtitleInputRef} onChange={onSubtitleChange} accept=".srt,.vtt,text/vtt,application/x-subrip" type="file" hidden/></div></section>
        <div className="lesson-heading"><div><h2>{videoName ?? subtitleName ?? "Хичээлийн файл"}</h2><p>{segments.length ? `${segments.length} хадмалын мөр бэлэн` : "Видео болон хадмал файл оруулна уу"}</p></div><span className="lesson-count">{activeSegmentIndex >= 0 ? `МӨР ${activeSegmentIndex + 1} / ${segments.length}` : duration ? `${formatTimestamp(duration)} НИЙТ` : "БЭЛЭН БИШ"}</span></div>
        <section className="player-card"><div className="video-panel"><div className="video-top"><span className="video-tag"><span>✦</span> ЛОКАЛ ВИДЕО</span><span className="video-duration">{formatTimestamp(duration)}</span></div>{videoUrl ? <div className="video-frame"><video key={lessonId} ref={videoRef} className="local-video" src={videoUrl} onTimeUpdate={syncTime} onLoadedMetadata={() => { const video = videoRef.current; if (!video) return; setDuration(Number.isFinite(video.duration) ? video.duration : 0); if (restoreTimeRef.current > 0 && Number.isFinite(video.duration)) { video.currentTime = Math.min(restoreTimeRef.current, video.duration); restoreTimeRef.current = 0; syncTime(); } }} onError={() => setError("Энэ видео файлыг браузер тоглуулж чадсангүй. MP4 эсвэл WebM өөр хувилбар сонгоно уу.")} onPlay={() => setIsPlaying(true)} onPause={() => { setIsPlaying(false); stopSpeech(); }} onSeeking={() => { syncTime(); stopSpeech(); }} onSeeked={syncTime} onEnded={() => { setIsPlaying(false); stopSpeech(); }} controls />{activeSegment && <div className="video-subtitle" aria-live="polite">{activeSegment.translatedText?.trim() || activeSegment.text}</div>}</div> : <div className="video-art"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="art-sun"/><div className="art-caption">ТАНЫ<br/><span>ХИЧЭЭЛ</span></div></div>}<div className="video-controls"><button className="play-button" onClick={togglePlay} disabled={!videoUrl} aria-label="Тоглуулах">{isPlaying ? "Ⅱ" : "▶"}</button><span className="video-time">{formatTimestamp(currentTime)} <span>/ {formatTimestamp(duration)}</span></span><div className="progress-track"><span style={{ width: duration ? `${(currentTime / duration) * 100}%` : "0%" }}/></div><span className="control-label">ХАДМАЛ</span></div></div>
          <div className="player-info"><div className="lesson-type"><span className="type-dot"/> ХАДМАЛТАЙ ВИДЕО</div><h3>{activeSegment ? activeSegment.text : "Хичээлээ эхлүүлээрэй"}</h3><p className="lesson-desc">Видео тоглох үед тухайн хугацааны хадмал доорх жагсаалтад тодорно.</p><div className="cue-navigation"><button type="button" disabled={!videoUrl || getAdjacentSegmentIndex(-1) < 0} onClick={() => navigateSegment(-1)}>← Өмнөх мөр</button><button type="button" disabled={!videoUrl || activeSegmentIndex < 0} onClick={() => activeSegment && seekTo(activeSegment)}>Одоогийн мөр</button><button type="button" disabled={!videoUrl || getAdjacentSegmentIndex(1) < 0 || getAdjacentSegmentIndex(1) >= segments.length} onClick={() => navigateSegment(1)}>Дараах мөр →</button></div><div className="divider"/><div className="audio-heading"><div><span className="audio-icon">♫</span><strong>Монгол ярианы TTS</strong></div><span className="audio-status">{speechStatus === "loading" ? "ДУУ ҮҮСГЭЖ БАЙНА" : speechStatus === "playing" ? "УНШИЖ БАЙНА" : "ҮНЭГҮЙ · ОНЛАЙН"}</span></div><label className="speech-toggle"><input type="checkbox" checked={speechEnabled} disabled={!segments.some((segment) => segment.translatedText?.trim())} onChange={(event) => { setSpeechEnabled(event.target.checked); setSpeechError(undefined); if (!event.target.checked) stopSpeech(); }}/><span>Видео дагаж Монгол дуугаар унших</span></label><label className="voice-select"><span>Дууны өнгө</span><select aria-label="Монгол дуу хоолой" value={speechVoice} onChange={(event) => { const voice = event.target.value; if (isMongolianTtsVoice(voice)) { stopSpeech(); setSpeechVoice(voice); } }}><option value={MONGOLIAN_TTS_VOICES.bataa}>Батаа · эрэгтэй</option><option value={MONGOLIAN_TTS_VOICES.yesui}>Есүй · эмэгтэй</option></select></label><div className="audio-placeholder">{speechError ?? "Монгол TTS нь дууг дуурайж дуулахгүй, орчуулгыг сэтгэл хөдлөлтэй яриагаар уншина. Асаахад Монгол орчуулга Microsoft Edge-ийн TTS үйлчилгээнд илгээгдэнэ."}</div><div className="audio-meta"><span>{speechEnabled ? speechStatus === "loading" ? "Дуу бэлдэж байна…" : speechStatus === "playing" ? "Сэтгэл хөдлөлтэй уншиж байна" : "Дуу асаалттай" : "Дуугүй горим"}</span><span>Интернэт шаардлагатай</span></div></div></section>
        <section className="subtitles-section">
          <div className="subtitles-heading">
            <div><h2>Хадмалын мөрүүд</h2><p>Видеоноос яриа таних эсвэл SRT/VTT оруулна. Мөр дээр дарж видеог шилжүүлнэ.</p></div>
            <div className="subtitle-actions">
              <label className="translation-style"><span>Орчуулгын төрөл</span><select aria-label="Орчуулгын төрөл" value={translationMode} disabled={isTranslating || isTranscribing} onChange={(event) => {
                const mode = event.target.value;
                if (mode === "auto" || mode === "song" || mode === "dialogue") setTranslationMode(mode);
              }}>
                <option value="auto">Авто ({detectedTranslationStyle === "song" ? "дуу" : "яриа"})</option>
                <option value="song">Дууны үг</option>
                <option value="dialogue">Энгийн яриа</option>
              </select></label>
              <button className="subtitles-action" disabled={!videoFile || isTranscribing || isTranslating} onClick={transcribeVideo}>{isTranscribing ? "Яриа таньж байна…" : "Видео яриаг таних"}</button>
              <button className="subtitles-action translate-button" disabled={!missingTranslationCount || isTranslating || isTranscribing} onClick={translateAll}>{isTranslating ? "Орчуулж байна…" : missingTranslationCount < segments.length ? `Дутуу ${missingTranslationCount} мөрийг орчуулах` : "Бүгдийг орчуулах"}</button>
              <button className="subtitles-action" disabled={!allSegmentsTranslated || isTranscribing} onClick={downloadTranslatedVtt}>VTT татах</button>
              <button className="subtitles-action" disabled={isTranscribing || isTranslating} onClick={() => subtitleInputRef.current?.click()}>Хадмал оруулах <span>↗</span></button>
            </div>
          </div>
          <div className="subtitle-table">
            <div className="table-head"><span>ХУГАЦАА</span><span>АНГЛИ ЭХ</span><span>МОНГОЛ ОРЧУУЛГА</span><span>ЗАСАХ</span></div>
            {segments.length ? segments.map((segment, index) => (
              <div className="subtitle-item" key={segment.id}>
                <div className="subtitle-item-row">
                  <button className={`subtitle-row ${activeSegment?.id === segment.id ? "current" : ""}`} onClick={() => seekTo(segment)}>
                    <span className="timestamp">{formatTimestamp(segment.start)}</span><span className="english">{segment.text}</span><span className="mongolian">{segment.translatedText ?? "Орчуулга тохируулаагүй"}</span>
                  </button>
                  <button className="subtitle-edit-button" aria-label={`Хадмал засах ${index + 1}`} disabled={isTranslating || isTranscribing} onClick={() => editSegment(segment)}>Засах</button>
                </div>
                {editingSegmentId === segment.id && segmentDraft && (
                  <form className="subtitle-editor" onSubmit={(event) => saveSegmentEdit(event, segment)}>
                    <label>Англи эх<textarea autoFocus maxLength={MAX_SUBTITLE_TEXT_LENGTH} value={segmentDraft.text} onChange={(event) => setSegmentDraft({ ...segmentDraft, text: event.target.value })}/></label>
                    <label>Монгол орчуулга<textarea maxLength={MAX_SUBTITLE_TEXT_LENGTH} value={segmentDraft.translatedText} onChange={(event) => setSegmentDraft({ ...segmentDraft, translatedText: event.target.value })}/></label>
                    <div className="subtitle-time-fields">
                      <label>Эхлэх (секунд)<input type="number" min="0" step="0.01" value={segmentDraft.start} onChange={(event) => setSegmentDraft({ ...segmentDraft, start: event.target.value })}/></label>
                      <label>Дуусах (секунд)<input type="number" min="0" step="0.01" value={segmentDraft.end} onChange={(event) => setSegmentDraft({ ...segmentDraft, end: event.target.value })}/></label>
                    </div>
                    <p>Эх текст өөрчилбөл хуучин орчуулгыг арилгаж, дахин орчуулах шаардлагатай.</p>
                    <div className="subtitle-editor-actions"><button type="button" onClick={cancelSegmentEdit}>Болих</button><button type="submit">Хадгалах</button></div>
                  </form>
                )}
              </div>
            )) : <div className="empty-subtitles">.srt эсвэл .vtt файл оруулах, эсвэл видео яриаг таних товч дарна уу.</div>}
          </div>
        </section>
        <footer className="footer"><span>LearnDub AI <span className="footer-dot">·</span> Сурах бүрт ойр</span><span>Локал хувилбар</span></footer></div></section>
  </main>;
}
