import { describe, expect, it } from "vitest";
import { applySubtitleEdit, buildMissingTranslationTasks, formatTranslatedVtt, parseSubtitle } from "../src/lib/subtitle-parser";

describe("parseSubtitle", () => {
  it("reads short VTT timestamps, cue settings, identifiers and long hours", () => {
    const result = parseSubtitle("WEBVTT lesson\n\nintro\n01:23.456 --> 01:25.000 align:start\nHello\n\n100:00:00.000 --> 100:00:01.000\nLater", "lesson.vtt");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.segments.map(({ start, end }) => [start, end])).toEqual([[83.456, 85], [360000, 360001]]);
  });

  it("skips entire VTT metadata blocks even when they contain cue-like text", () => {
    const result = parseSubtitle("WEBVTT\n\nNOTE comment\n00:01.000 --> 00:02.000\nHidden\n\nSTYLE\n::cue { color: red; }\n\nREGION\nid:main\n\nNOTEworthy\n00:03.000 --> 00:04.000\nVisible", "lesson.vtt");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.segments.map(({ text }) => text)).toEqual(["Visible"]);
  });

  it("decodes entities after stripping tags and preserves literal angle brackets", () => {
    const result = parseSubtitle("WEBVTT\n\n00:01.000 --> 00:02.000\n<b>A &lt; B &amp; C</b>&nbsp;&#39;hi&#x27; &#x1F600; &#x110000;", "lesson.vtt");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.segments[0].text).toBe("A < B & C 'hi' 😀 &#x110000;");
  });

  it("rejects malformed VTT headers and out-of-range clock values", () => {
    expect(parseSubtitle("WEBVTTinvalid\n\n00:01.000 --> 00:02.000\nHello", "lesson.vtt").ok).toBe(false);
    expect(parseSubtitle("1\n00:60:00,000 --> 00:60:01,000\nInvalid", "lesson.srt").ok).toBe(false);
    expect(parseSubtitle("1\n00:00:60,000 --> 00:01:02,000\nInvalid", "lesson.srt").ok).toBe(false);
  });

  it("sorts imported cues into playback order", () => {
    const result = parseSubtitle("1\n00:00:03,000 --> 00:00:04,000\nLater\n\n2\n00:00:01,000 --> 00:00:02,000\nEarlier", "lesson.srt");
    if (!result.ok) throw new Error(result.error);
    expect(result.segments.map(({ text }) => text)).toEqual(["Earlier", "Later"]);
  });

  it("round trips exported subtitle entities without changing text", () => {
    const text = "A < B & C > D";
    const result = parseSubtitle(formatTranslatedVtt([{ id: "cue-0", start: 1, end: 2, text: "Source", translatedText: text }]), "lesson.vtt");
    if (!result.ok) throw new Error(result.error);
    expect(result.segments[0].text).toBe(text);
  });

  it("rejects a blank start time instead of treating it as zero", () => {
    expect(applySubtitleEdit({ id: "cue-0", start: 1, end: 2, text: "Hello" }, { start: " ", end: "2", text: "Hello", translatedText: "" }).ok).toBe(false);
  });

  it("reads SRT subtitles", () => {
    const result = parseSubtitle("1\n00:00:01,200 --> 00:00:03,450\nHello world!\n\n2\n00:00:04,000 --> 00:00:05,000\nSecond line", "lesson.srt");
    expect(result).toMatchObject({ ok: true, skippedDuplicates: 0 });
    if (result.ok) expect(result.segments).toEqual([{ id: "cue-0", start: 1.2, end: 3.45, text: "Hello world!" }, { id: "cue-1", start: 4, end: 5, text: "Second line" }]);
  });
  it("reads VTT subtitles and strips markup", () => {
    const result = parseSubtitle("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n<b>Сайн</b> байна", "lesson.vtt");
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.segments[0].text).toBe("Сайн байна");
  });
  it("rejects empty files and unsupported formats", () => {
    expect(parseSubtitle("", "lesson.srt")).toMatchObject({ ok: false, error: "Хадмалын файл хоосон байна." });
    expect(parseSubtitle("anything", "lesson.txt")).toMatchObject({ ok: false });
  });
  it("removes exact duplicate cues and ignores invalid timings", () => {
    const result = parseSubtitle("1\n00:00:02,000 --> 00:00:01,000\nInvalid\n\n2\n00:00:03,000 --> 00:00:04,000\nSame\n\n3\n00:00:03,000 --> 00:00:04,000\nSame", "lesson.srt");
    expect(result).toMatchObject({ ok: true, skippedDuplicates: 1 });
    if (result.ok) expect(result.segments).toHaveLength(1);
  });

  it("exports translated cues as WebVTT with millisecond timestamps", () => {
    expect(formatTranslatedVtt([
      { id: "cue-0", start: 1.2, end: 3.45, text: "Hello", translatedText: "Сайн уу" },
      { id: "cue-1", start: 61, end: 62.005, text: "A < B", translatedText: "A < B & C" },
    ])).toBe("WEBVTT\n\ncue-0\n00:00:01.200 --> 00:00:03.450\nСайн уу\n\ncue-1\n00:01:01.000 --> 00:01:02.005\nA &lt; B &amp; C\n");
  });

  it("refuses to export untranslated cues", () => {
    expect(() => formatTranslatedVtt([{ id: "cue-0", start: 0, end: 1, text: "Hello" }]))
      .toThrow("бүх хадмалын мөрийг орчуулна уу");
  });

  it("saves valid subtitle edits and invalidates translations when source text changes", () => {
    const original = { id: "cue-0", start: 1, end: 2, text: "Hello", translatedText: "Сайн уу" };
    expect(applySubtitleEdit(original, {
      start: "1.25",
      end: "2.5",
      text: "Hello there",
      translatedText: "Сайн уу",
    })).toEqual({
      ok: true,
      sourceChanged: true,
      segment: { id: "cue-0", start: 1.25, end: 2.5, text: "Hello there", translatedText: undefined },
    });
    expect(applySubtitleEdit(original, {
      start: "1",
      end: "2",
      text: "Hello",
      translatedText: "Сайн байна уу",
    })).toEqual({
      ok: true,
      sourceChanged: false,
      segment: { ...original, translatedText: "Сайн байна уу" },
    });
  });

  it("rejects empty subtitle text and invalid timing edits", () => {
    const original = { id: "cue-0", start: 1, end: 2, text: "Hello" };
    expect(applySubtitleEdit(original, { start: "1", end: "2", text: " ", translatedText: "" }))
      .toMatchObject({ ok: false, error: "Эх хадмал хоосон байж болохгүй." });
    const invalidTiming = applySubtitleEdit(original, { start: "2", end: "1", text: "Hello", translatedText: "" });
    expect(invalidTiming.ok).toBe(false);
    if (!invalidTiming.ok) expect(invalidTiming.error).toContain("Хадмалын эхлэх/дуусах хугацаа зөв биш байна.");
  });

  it("translates only missing cues and includes neighboring cues as context", () => {
    const tasks = buildMissingTranslationTasks([
      { id: "cue-0", start: 0, end: 1, text: "Earlier translated cue", translatedText: "Өмнөх орчуулга" },
      { id: "cue-1", start: 1, end: 2, text: "First missing cue" },
      { id: "cue-2", start: 2, end: 3, text: "Second missing cue" },
      { id: "cue-3", start: 3, end: 4, text: "Later translated cue", translatedText: "Дараах орчуулга" },
    ]);
    expect(tasks).toEqual([{
      segments: [
        { id: "cue-0", start: 0, end: 1, text: "Earlier translated cue", translatedText: "Өмнөх орчуулга" },
        { id: "cue-1", start: 1, end: 2, text: "First missing cue" },
        { id: "cue-2", start: 2, end: 3, text: "Second missing cue" },
        { id: "cue-3", start: 3, end: 4, text: "Later translated cue", translatedText: "Дараах орчуулга" },
      ],
      targetIds: ["cue-1", "cue-2"],
    }]);
  });

  it("keeps every translation batch within the configured size", () => {
    const segments = Array.from({ length: 22 }, (_, index) => ({
      id: `cue-${index}`,
      start: index,
      end: index + 1,
      text: `Cue ${index}`,
      ...(index === 11 ? { translatedText: "Бэлэн орчуулга" } : {}),
    }));
    const tasks = buildMissingTranslationTasks(segments);
    const translatedTargets = tasks.flatMap(({ targetIds }) => targetIds);
    expect(tasks.every(({ segments: batch }) => batch.length <= 8)).toBe(true);
    expect(translatedTargets).toHaveLength(21);
    expect(translatedTargets).not.toContain("cue-11");
    expect(tasks.flatMap(({ segments: batch }) => batch.map(({ id }) => id))).toContain("cue-11");
  });

  it("includes one-cue neighbor context without exceeding the API text limit", () => {
    const cues = [
      { id: "cue-0", start: 0, end: 1, text: "A".repeat(990), translatedText: "Өмнөх" },
      { id: "cue-1", start: 1, end: 2, text: "B".repeat(3_000) },
      { id: "cue-2", start: 2, end: 3, text: "C".repeat(990), translatedText: "Дараах" },
    ];
    const [task] = buildMissingTranslationTasks(cues);
    expect(task.targetIds).toEqual(["cue-1"]);
    expect(task.segments.map(({ id }) => id)).toEqual(["cue-0", "cue-1", "cue-2"]);
    expect(task.segments.reduce((total, segment) => total + segment.text.length + (segment.translatedText?.length ?? 0), 0))
      .toBeLessThanOrEqual(5_000);
  });

  it("rejects translation batches too small to preserve context", () => {
    expect(() => buildMissingTranslationTasks([], 2)).toThrow("дор хаяж 3 мөр");
  });
});
