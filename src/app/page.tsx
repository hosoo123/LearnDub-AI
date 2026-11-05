"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { applySubtitleEdit, buildMissingTranslationTasks, formatTimestamp, formatTranslatedVtt, MAX_SUBTITLE_FILE_BYTES, MAX_SUBTITLE_TEXT_LENGTH, parseSubtitle, SubtitleSegment } from "@/lib/subtitle-parser";

const MAX_VIDEO_FILE_BYTES = 250 * 1024 * 1024;
const TRANSLATION_BATCH_SIZE = 8;

type SegmentDraft = {
  start: string;
  end: string;
  text: string;
  translatedText: string;
};

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const subtitleInputRef = useRef<HTMLInputElement>(null);
  const spokenSegmentIdRef = useRef<string | undefined>(undefined);
  const [videoFile, setVideoFile] = useState<File>();
  const [videoUrl, setVideoUrl] = useState<string>();
  const [videoName, setVideoName] = useState<string>();
  const [subtitleName, setSubtitleName] = useState<string>();
  const [segments, setSegments] = useState<SubtitleSegment[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [mongolianVoice, setMongolianVoice] = useState<SpeechSynthesisVoice>();
  const [speechEnabled, setSpeechEnabled] = useState(false);
  const [editingSegmentId, setEditingSegmentId] = useState<string>();
  const [segmentDraft, setSegmentDraft] = useState<SegmentDraft>();
  const [message, setMessage] = useState("Видео болон хадмал файл сонгож эхлээрэй.");
  const [error, setError] = useState<string>();
  const allSegmentsTranslated = segments.length > 0 && segments.every((segment) => Boolean(segment.translatedText?.trim()));
  const missingTranslationCount = segments.filter((segment) => !segment.translatedText?.trim()).length;

  useEffect(() => () => { if (videoUrl) URL.revokeObjectURL(videoUrl); }, [videoUrl]);
  const activeSegment = useMemo(() => segments.find((segment) => currentTime >= segment.start && currentTime < segment.end), [segments, currentTime]);

  useEffect(() => {
    const updateVoices = () => setMongolianVoice(window.speechSynthesis.getVoices().find((voice) => voice.lang.toLowerCase().startsWith("mn")));
    updateVoices();
    window.speechSynthesis.addEventListener("voiceschanged", updateVoices);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", updateVoices);
  }, []);

  useEffect(() => {
    if (!speechEnabled || !isPlaying || !activeSegment?.translatedText || !mongolianVoice) return;
    if (spokenSegmentIdRef.current === activeSegment.id) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(activeSegment.translatedText);
    utterance.lang = mongolianVoice.lang;
    utterance.voice = mongolianVoice;
    utterance.rate = 1;
    window.speechSynthesis.speak(utterance);
    spokenSegmentIdRef.current = activeSegment.id;
  }, [activeSegment, isPlaying, mongolianVoice, speechEnabled]);

  useEffect(() => () => window.speechSynthesis.cancel(), []);

  function onVideoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(undefined);
    if (!/\.(mp4|webm)$/i.test(file.name)) { setError("Зөвхөн .mp4 эсвэл .webm видео файл сонгоно уу."); return; }
    if (file.size > MAX_VIDEO_FILE_BYTES) { setError("Видео файл 250 MB-аас ихгүй байх ёстой."); return; }
    setVideoUrl((previous) => { if (previous) URL.revokeObjectURL(previous); return URL.createObjectURL(file); });
    setVideoFile(file);
    setVideoName(file.name);
    setSegments([]);
    cancelSegmentEdit();
    setSubtitleName(undefined);
    setMessage("Видео бэлэн боллоо. Одоо .srt эсвэл .vtt хадмал оруулна уу.");
  }

  async function onSubtitleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(undefined);
    if (file.size > MAX_SUBTITLE_FILE_BYTES) { setError("Хадмалын файл 1 MB-аас ихгүй байх ёстой."); return; }
    const result = parseSubtitle(await file.text(), file.name);
    if (!result.ok) { setSegments([]); cancelSegmentEdit(); setError(result.error); return; }
    setSegments(result.segments);
    cancelSegmentEdit();
    setSubtitleName(file.name);
    setMessage(`${result.segments.length} хадмалын мөр амжилттай уншигдлаа.${result.skippedDuplicates ? ` ${result.skippedDuplicates} давхардсан мөр алгасагдлаа.` : ""}`);
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

  function syncTime() { if (videoRef.current) setCurrentTime(videoRef.current.currentTime); }
  function stopSpeech() { window.speechSynthesis.cancel(); spokenSegmentIdRef.current = undefined; }
  function seekTo(segment: SubtitleSegment) { if (!videoRef.current) return; stopSpeech(); videoRef.current.currentTime = segment.start; syncTime(); }
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
      setMessage(`${missingTranslationCount} дутуу мөрийг ойролцоох контекстээр орчууллаа. Таны өмнөх орчуулгууд хэвээр үлдлээ.`);
    } catch (translationError) { setError(translationError instanceof Error ? translationError.message : "Орчуулга амжилтгүй боллоо."); }
    finally { setIsTranslating(false); }
  }

  return <main className="app-shell">
    <aside className="sidebar"><a className="brand" href="#home"><span className="brand-mark">L<span>·</span></span><span>learndub<span className="brand-ai"> AI</span></span></a><div className="sidebar-label">WORKSPACE</div><a className="nav-item active" href="#studio"><span className="nav-icon">◫</span> Суралцах студи</a><a className="nav-item muted" href="#library"><span className="nav-icon">▤</span> Миний сан <span className="soon">Удахгүй</span></a><div className="sidebar-bottom"><div className="help-card"><span className="help-spark">✳</span><strong>Зөвшөөрөлтэй контент ашиглана уу</strong><p>Өөрийн эсвэл ашиглах эрхтэй видео, хадмал файл л оруулна.</p></div><div className="profile"><div className="avatar">С</div><div><strong>Суралцагч</strong><span>Үнэгүй demo</span></div></div></div></aside>
    <section className="main-area" id="home"><header className="topbar"><div className="breadcrumb">Суралцах студи <span>/</span> <strong>Хичээл үзэх</strong></div><div className="topbar-right"><span className="demo-pill"><i /> MVP ХУВИЛБАР</span><button className="avatar top-avatar" aria-label="Хэрэглэгч">С</button></div></header>
      <div className="content" id="studio"><div className="welcome-row"><div><div className="eyebrow"><span>ӨӨРИЙН ХЭМНЭЛЭЭР СУР</span><span className="eyebrow-line" /></div><h1>Суралцах студи <span className="wave-emoji">👋</span></h1><p className="intro">Видео болон хадмал оруулж, хугацаатай нь дагаж үзээрэй.</p></div></div>
        <div className={`notice ${error ? "notice-error" : ""}`}><span className="notice-icon">{error ? "!" : "i"}</span><p><strong>{error ? "Файл уншихад алдаа гарлаа" : "MVP төлөв"}</strong><span>{error ?? message}</span></p></div>
        <section className="import-card" aria-label="Файл оруулах"><div><span className="upload-kicker">АЛХАМ 1</span><h2>Хичээлийн файлаа оруулна уу</h2><p>Видео: MP4, WebM · Хадмал: SRT, VTT</p></div><div className="import-actions"><button disabled={isTranscribing || isTranslating} onClick={() => videoInputRef.current?.click()} className="import-button">{videoName ? "Видео солих" : "Видео сонгох"}</button><button disabled={isTranscribing || isTranslating} onClick={() => subtitleInputRef.current?.click()} className="import-button secondary">Хадмал оруулах</button><input ref={videoInputRef} onChange={onVideoChange} accept="video/mp4,video/webm,.mp4,.webm" type="file" hidden/><input ref={subtitleInputRef} onChange={onSubtitleChange} accept=".srt,.vtt,text/vtt,application/x-subrip" type="file" hidden/></div></section>
        <div className="lesson-heading"><div><h2>{videoName ?? "Таны видео"}</h2><p>{segments.length ? `${segments.length} хадмалын мөр бэлэн` : "Видео болон хадмал файл оруулна уу"}</p></div><span className="lesson-count">{duration ? `${formatTimestamp(duration)} НИЙТ` : "БЭЛЭН БИШ"}</span></div>
        <section className="player-card"><div className="video-panel"><div className="video-top"><span className="video-tag"><span>✦</span> LOCAL VIDEO</span><span className="video-duration">{formatTimestamp(duration)}</span></div>{videoUrl ? <div className="video-frame"><video ref={videoRef} className="local-video" src={videoUrl} onTimeUpdate={syncTime} onLoadedMetadata={() => setDuration(videoRef.current?.duration ?? 0)} onPlay={() => setIsPlaying(true)} onPause={() => { setIsPlaying(false); stopSpeech(); }} onSeeking={() => { syncTime(); stopSpeech(); }} onSeeked={syncTime} onEnded={() => { setIsPlaying(false); stopSpeech(); }} controls />{activeSegment && <div className="video-subtitle" aria-live="polite">{activeSegment.translatedText?.trim() || activeSegment.text}</div>}</div> : <div className="video-art"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="art-sun"/><div className="art-caption">YOUR<br/><span>LESSON</span></div></div>}<div className="video-controls"><button className="play-button" onClick={togglePlay} disabled={!videoUrl} aria-label="Тоглуулах">{isPlaying ? "Ⅱ" : "▶"}</button><span className="video-time">{formatTimestamp(currentTime)} <span>/ {formatTimestamp(duration)}</span></span><div className="progress-track"><span style={{ width: duration ? `${(currentTime / duration) * 100}%` : "0%" }}/></div><span className="control-label">CC</span></div></div>
          <div className="player-info"><div className="lesson-type"><span className="type-dot"/> ХАДМАЛТАЙ ВИДЕО</div><h3>{activeSegment ? activeSegment.text : "Хичээлээ эхлүүлээрэй"}</h3><p className="lesson-desc">Видео тоглох үед тухайн хугацааны хадмал доорх жагсаалтад тодорно.</p><div className="divider"/><div className="audio-heading"><div><span className="audio-icon">♫</span><strong>Монгол дуу</strong></div><span className="audio-status">{mongolianVoice ? "BROWSER VOICE" : "VOICE ИЛРЭЭГҮЙ"}</span></div><label className="speech-toggle"><input type="checkbox" checked={speechEnabled} disabled={!mongolianVoice} onChange={(event) => { setSpeechEnabled(event.target.checked); if (!event.target.checked) stopSpeech(); }}/><span>Монгол дуугаар унших</span></label><div className="audio-placeholder">{mongolianVoice ? `${mongolianVoice.name} (${mongolianVoice.lang}) ашиглана.` : "Энэ төхөөрөмж дээр Монгол browser voice олдсонгүй."}</div><div className="audio-meta"><span>{speechEnabled ? "Дуу асаалттай" : "Дуугүй горим"}</span><span>Үнэгүй</span></div></div></section>
        <section className="subtitles-section">
          <div className="subtitles-heading">
            <div><h2>Хадмалын мөрүүд</h2><p>Видеоноос яриа таних эсвэл SRT/VTT оруулна. Мөр дээр дарж видеог шилжүүлнэ.</p></div>
            <div className="subtitle-actions">
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
        <footer className="footer"><span>LearnDub AI <span className="footer-dot">·</span> Сурах бүрт ойр</span><span>Local MVP</span></footer></div></section>
  </main>;
}
