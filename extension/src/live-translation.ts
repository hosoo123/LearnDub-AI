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
  private pending = false;
  private generation = 0;
  private source = "";
  private changedAt = 0;
  private videoId: string | undefined;
  private history: ContextCue[] = [];
  private lastVideoTime = 0;
  private prefetching = false;
  private requests = new PendingRequests<Reply>();

  constructor(private readCaption: () => string, private getVideoId: () => string | undefined,
    private getCueEnd: () => number | undefined = () => undefined,
    private upcoming: () => readonly { text: string }[] = () => []) {}

  toggle() {
    this.syncGate.reset();
    this.speech.sync(null, "");
    this.enabled = !this.enabled;
    if (!this.enabled && this.speech.enabled) this.speech.toggle();
    this.error = undefined;
    this.generation += 1;
    this.pending = false;
    this.prefetching = false;
    this.source = "";
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
    this.pending = this.prefetching = false;
    this.error = undefined;
    this.speech.recover();
    this.syncGate.reset();
    this.changedAt = 0;
    this.render(this.cache.get(this.source) ?? "");
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
      this.overlay.style.cssText = "position:absolute;bottom:18%;left:5%;width:90%;z-index:60;pointer-events:none;text-align:center;font:600 clamp(16px,2vw,28px)/1.4 Arial,sans-serif;color:white;text-shadow:0 2px 4px black;white-space:pre-wrap;";
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
      this.pending = false;
      this.prefetching = false;
      this.source = "";
      this.error = undefined;
      this.cache.clear();
      this.history = [];
      this.speech.sync(null, "");
      this.render("");
    }
    if (!videoId) { this.render(""); return; }
    const source = this.readCaption();
    const video = document.querySelector<HTMLVideoElement>("video");
    if (video && (video.currentTime < this.lastVideoTime - 0.5 || video.currentTime > this.lastVideoTime + 3)) {
      this.syncGate.release(false);
      this.generation += 1;
      this.pending = false;
      this.prefetching = false;
      this.history = [];
      this.source = "";
      this.cache.clear();
      this.speech.sync(null, "");
      this.render("");
    }
    if (video) this.lastVideoTime = video.currentTime;
    this.speech.sync(video, source, this.cache.get(source), this.getCueEnd());
    if (source !== this.source) {
      if (this.source) this.history = [...this.history, { text: this.source, translatedText: this.cache.get(this.source) }].slice(-2);
      this.source = source;
      this.changedAt = Date.now();
      this.render(this.cache.get(source) ?? "");
    }
    const translated = this.cache.get(source);
    if (translated && this.overlay?.textContent !== translated) this.render(translated);
    const ready = Boolean(translated && (!this.speech.enabled || this.speech.isPrepared(source, translated)));
    if (Date.now() - this.changedAt >= 450) this.syncGate.update(video, source, ready || Boolean(this.error || this.speech.error));
    if (this.syncGate.waiting && translated && this.speech.enabled && !this.speech.isPrepared(source, translated)) {
      const generation = this.generation;
      void this.speech.prepare(source, translated).catch((error: unknown) => {
        if (!this.enabled || generation !== this.generation || source !== this.source) return;
        this.speech.error = error instanceof Error ? error.message : "Монгол дуу бэлэн болсонгүй.";
        this.syncGate.release(true);
      });
    }
    // Only prefetch when the current line needs no translation request.
    if (!source || this.cache.has(source)) void this.prefetch();
    if (!source || this.pending || this.error || this.cache.has(source) || Date.now() - this.changedAt < 450) return;
    const generation = this.generation;
    this.pending = true;
    try {
      const reply = await this.translate(source,
        this.history.map((cue) => ({ ...cue, translatedText: this.cache.get(cue.text) ?? cue.translatedText })));
      if (!this.enabled || generation !== this.generation) return;
      if (!reply?.ok || !reply.text) throw new Error(reply?.error ?? "Орчуулга амжилтгүй боллоо.");
      if (this.cache.size >= 300) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(source, reply.text);
      // Never put a delayed response over a different spoken sentence.
      if (source === this.readCaption()) this.render(reply.text);
    } catch (error) {
      if (this.enabled && generation === this.generation) {
        this.error = error instanceof Error ? error.message : "Орчуулгын холболт тасарлаа.";
        this.render("Монгол хадмалын алдаа — extension цэсийг нээнэ үү.");
      }
    } finally {
      if (generation === this.generation) this.pending = false;
    }
  }

  private async prefetch() {
    if (this.prefetching || this.pending || this.error || !this.enabled) return;
    this.prefetching = true;
    const generation = this.generation;
    try {
      for (const cue of this.upcoming()) {
        if (!this.enabled || generation !== this.generation || this.pending) break;
        let translated = this.cache.get(cue.text);
        if (!translated) {
          const reply = await this.translate(cue.text,
            [...this.history, ...(this.source ? [{ text: this.source, translatedText: this.cache.get(this.source) }] : [])].slice(-2));
          if (!this.enabled || generation !== this.generation) break;
          if (!reply?.ok || !reply.text) break;
          translated = reply.text;
          if (this.cache.size >= 300) this.cache.delete(this.cache.keys().next().value!);
          this.cache.set(cue.text, translated);
        }
        if (this.speech.enabled) await this.speech.prepare(cue.text, translated);
      }
    } catch { /* Prefetch failure must not disable live translation. */ }
    finally { if (generation === this.generation) this.prefetching = false; }
  }
}
