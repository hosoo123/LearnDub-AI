import { LiveSpeech } from "./live-speech";
import type { ContextCue } from "./translation-context";
import { SyncGate } from "./sync-gate";
import { PendingRequests } from "./pending-requests";
type Reply = { ok?: boolean; text?: string; error?: string };

export class LiveTranslation {
  readonly speech = new LiveSpeech();
  readonly syncGate = new SyncGate();
  enabled = false;
  error: string | undefined;
  private timer: number | undefined;
  private overlay: HTMLDivElement | undefined;
  private cache = new Map<string, string>();
  private activeKeys = new Set<string>();
  private generation = 0;
  private source = "";
  private cueKey = "";
  private cacheKey = "";
  private changedAt = 0;
  private videoId: string | undefined;
  private history: ContextCue[] = [];
  private lastVideoTime = 0;
  private prefetching = false;
  private requests = new PendingRequests<Reply>();

  get status() {
    return {
      captionDetected: Boolean(this.source),
      requestPending: this.activeKeys.has(this.cacheKey),
      translated: Boolean(this.cache.get(this.cacheKey)),
    };
  }

  constructor(private readCaption: () => string, private getVideoId: () => string | undefined,
    private getCueEnd: () => number | undefined = () => undefined,
    private upcoming: () => readonly { text: string; key?: string }[] = () => [],
    private getCueKey: () => string | undefined = () => undefined) {}

  toggle() {
    this.syncGate.reset();
    this.speech.sync(null, "");
    this.enabled = !this.enabled;
    if (!this.enabled && this.speech.enabled) this.speech.toggle();
    this.error = undefined;
    this.generation += 1;
    this.activeKeys.clear();
    this.prefetching = false;
    this.source = "";
    this.cueKey = this.cacheKey = "";
    this.history = [];
    this.cache.clear();
    this.videoId = this.getVideoId();
    if (this.timer !== undefined) window.clearInterval(this.timer);
    this.timer = undefined;
    this.overlay?.remove();
    this.overlay = undefined;
    if (this.enabled) this.timer = window.setInterval(() => void this.sample(), 150);
    return this.enabled;
  }

  retry() {
    this.generation += 1;
    this.activeKeys.clear();
    this.prefetching = false;
    this.error = undefined;
    this.speech.recover();
    this.syncGate.reset();
    this.changedAt = 0;
    this.render(this.cache.get(this.cacheKey) ?? "");
  }

  dispose() {
    if (this.timer !== undefined) window.clearInterval(this.timer);
    this.timer = undefined;
    this.enabled = false;
    this.generation += 1;
    this.syncGate.reset(false);
    this.speech.sync(null, "");
    this.overlay?.remove();
  }

  private translate(text: string, history: ContextCue[]) {
    const message = { type: "LEARNDUB_TRANSLATE", text, history };
    // Share work within a playback session; a restart must get a fresh request.
    const key = JSON.stringify([this.generation, message]);
    return this.requests.run(key, () => chrome.runtime.sendMessage(message) as Promise<Reply>);
  }

  private render(text: string) {
    const player = document.querySelector<HTMLElement>("#movie_player, #shorts-player");
    if (!player) return;
    if (!this.overlay?.isConnected) {
      this.overlay = document.createElement("div");
      this.overlay.setAttribute("data-learndub-overlay", "true");
      this.overlay.style.cssText = "position:absolute!important;bottom:22%!important;left:5%!important;width:90%!important;z-index:2147483647!important;pointer-events:none!important;text-align:center!important;font:700 clamp(18px,2.2vw,30px)/1.4 Arial,sans-serif!important;color:#fff!important;text-shadow:0 2px 5px #000,0 0 2px #000!important;white-space:pre-wrap!important;";
      player.append(this.overlay);
    }
    this.overlay.textContent = text;
    this.overlay.hidden = !text;
  }

  private async sample() {
    const videoId = this.getVideoId();
    if (videoId !== this.videoId) {
      this.syncGate.reset(false);
      this.videoId = videoId;
      this.generation += 1;
      this.activeKeys.clear();
      this.prefetching = false;
      this.source = "";
      this.cueKey = this.cacheKey = "";
      this.error = undefined;
      this.cache.clear();
      this.history = [];
      this.speech.sync(null, "");
      this.render("");
    }
    if (!videoId) { this.render("LearnDub: YouTube видео олдсонгүй"); return; }
    const source = this.readCaption();
    if (!source) this.render("LearnDub: English CC хүлээж байна…");
    const video = document.querySelector<HTMLVideoElement>("video");
    if (video && (video.currentTime < this.lastVideoTime - 0.5 || video.currentTime > this.lastVideoTime + 3)) {
      this.syncGate.release(false);
      this.generation += 1;
      this.activeKeys.clear();
      this.prefetching = false;
      this.history = [];
      this.source = "";
      this.cueKey = this.cacheKey = "";
      this.cache.clear();
      this.speech.sync(null, "");
      this.render("");
    }
    if (video) this.lastVideoTime = video.currentTime;
    const cueKey = this.getCueKey() ?? source;
    const stabilizationMs = this.getCueKey() ? 0 : 250;
    if (source !== this.source || cueKey !== this.cueKey) {
      if (this.source) this.history = [...this.history, { text: this.source, translatedText: this.cache.get(this.cacheKey) }].slice(-2);
      this.source = source;
      this.cueKey = cueKey;
      this.cacheKey = cueKey;
      this.changedAt = Date.now();
      this.render(this.cache.get(this.cacheKey) ?? (source ? "LearnDub: Орчуулж байна…" : "LearnDub: English CC хүлээж байна…"));
    }
    const currentKey = this.cacheKey;
    const translated = this.cache.get(currentKey);
    this.speech.sync(video, source, translated, this.getCueEnd(), cueKey);
    if (translated && this.overlay?.textContent !== translated) this.render(translated);
    const ready = Boolean(translated && (!this.speech.enabled || this.speech.isPrepared(source, translated)));
    if (Date.now() - this.changedAt >= stabilizationMs) this.syncGate.update(video, source, ready || Boolean(this.error || this.speech.error));
    if (this.syncGate.waiting && translated && this.speech.enabled && !this.speech.isPrepared(source, translated)) {
      const generation = this.generation;
      const videoRemaining = video && this.getCueEnd() !== undefined ? this.getCueEnd()! - video.currentTime : undefined;
      void this.speech.prepare(source, translated, videoRemaining).catch((error: unknown) => {
        if (!this.enabled || generation !== this.generation || source !== this.source) return;
        this.speech.error = error instanceof Error ? error.message : "Монгол дуу бэлэн болсонгүй.";
        this.syncGate.release(true);
      });
    }
    // Timed transcripts let future cues prepare while the current cue translates.
    void this.prefetch();
    if (!source || this.error || this.cache.has(currentKey) || this.activeKeys.has(currentKey)
      || this.activeKeys.size >= 2 || Date.now() - this.changedAt < stabilizationMs) return;
    const generation = this.generation;
    this.activeKeys.add(currentKey);
    this.render("LearnDub: Орчуулж байна…");
    try {
      const reply = await this.translate(source,
        this.history.map((cue) => ({ ...cue, translatedText: this.cache.get(cue.text) ?? cue.translatedText })));
      if (!this.enabled || generation !== this.generation) return;
      if (!reply?.ok || !reply.text) throw new Error(reply?.error ?? "Орчуулга амжилтгүй боллоо.");
      if (this.cache.size >= 300) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(currentKey, reply.text);
      // Never put a delayed response over a different spoken sentence.
      if (currentKey === this.cacheKey && source === this.readCaption()) this.render(reply.text);
    } catch (error) {
      if (this.enabled && generation === this.generation && currentKey === this.cacheKey) {
        this.error = error instanceof Error ? error.message : "Орчуулгын холболт тасарлаа.";
        this.render("Монгол хадмалын алдаа — extension цэсийг нээнэ үү.");
      }
    } finally {
      this.activeKeys.delete(currentKey);
    }
  }

  private async prefetch() {
    // The current visible cue always owns the first request slot.
    if (this.prefetching || this.error || !this.enabled || (this.source && !this.cache.has(this.cacheKey))) return;
    this.prefetching = true;
    const generation = this.generation;
    let reservedKeys: string[] = [];
    try {
      const cues = this.upcoming().map((cue) => ({ key: cue.key ?? cue.text, text: cue.text }))
        .filter((cue) => !this.cache.has(cue.key) && !this.activeKeys.has(cue.key));
      if (!cues.length) return;
      reservedKeys = cues.map((cue) => cue.key);
      for (const key of reservedKeys) this.activeKeys.add(key);
      const reply = await chrome.runtime.sendMessage({ type: "LEARNDUB_TRANSLATE_BATCH", cues }) as
        { ok?: boolean; translations?: Array<{ key: string; source: string; text: string }> };
      if (!this.enabled || generation !== this.generation || !reply?.ok || !Array.isArray(reply.translations)) return;
      for (const translated of reply.translations) {
        if (this.cache.size >= 300) this.cache.delete(this.cache.keys().next().value!);
        this.cache.set(translated.key, translated.text);
      }
      if (this.speech.enabled) {
        await Promise.all(reply.translations.slice(0, 2).map((translated) => this.speech.prepare(translated.source, translated.text)));
      }
    } catch { /* Prefetch failure must not disable live translation. */ }
    finally {
      for (const key of reservedKeys) this.activeKeys.delete(key);
      if (generation === this.generation) this.prefetching = false;
    }
  }
}
