import { VoiceMixer } from "./voice-mixer";

export function synchronizedSpeechRate(audioRemaining: number, videoRemaining: number, videoRate: number) {
  const rate = Number.isFinite(videoRate) && videoRate > 0 ? videoRate : 1;
  const required = Number.isFinite(audioRemaining) && audioRemaining > 0 && Number.isFinite(videoRemaining) && videoRemaining > 0
    ? audioRemaining * rate / videoRemaining : rate;
  return Math.min(2.5, Math.max(0.8, rate, required));
}

export class LiveSpeech {
  enabled = false;
  error: string | undefined;
  speechGain = 1.25;
  originalMix = 0.15;
  private generation = 0;
  private source = "";
  private spoken = "";
  private audio: HTMLAudioElement | undefined;
  private video: HTMLVideoElement | undefined;
  private restoreVolume: (() => void) | undefined;
  private cueEnd: number | undefined;
  private audioCache = new Map<string, string>();
  private requests = new Map<string, Promise<string>>();
  private mixer = new VoiceMixer();
  private pausedByVideo = false;
  private buffering = false;
  private preparing = false;
  private pauseWithVideo = () => {
    if (this.audio) {
      this.audio.pause();
      this.pausedByVideo = true;
      this.restoreVolume?.();
      this.restoreVolume = undefined;
    } else if (!this.preparing) this.spoken = "";
  };
  private onWaiting = () => { this.buffering = true; this.pauseWithVideo(); };
  private onPlaying = () => { this.buffering = false; };
  private interrupt = () => { this.stop(); this.spoken = ""; };

  toggle() {
    this.enabled = !this.enabled;
    if (this.enabled) this.mixer.unlock();
    this.error = undefined;
    this.interrupt();
    return this.enabled;
  }

  stop() {
    this.generation += 1;
    this.audio?.pause();
    this.audio = undefined;
    this.pausedByVideo = false;
    this.preparing = false;
    this.mixer.disconnect();
    this.restoreVolume?.();
    this.restoreVolume = undefined;
  }

  sync(video: HTMLVideoElement | null, source: string, translation?: string, cueEnd?: number) {
    if ((video ?? undefined) !== this.video) {
      this.interrupt();
      this.source = "";
      this.cueEnd = undefined;
      for (const event of ["seeking", "ended", "emptied"]) this.video?.removeEventListener(event, this.interrupt);
      this.video?.removeEventListener("pause", this.pauseWithVideo);
      this.video?.removeEventListener("waiting", this.onWaiting);
      this.video?.removeEventListener("playing", this.onPlaying);
      this.video = video ?? undefined;
      this.buffering = false;
      for (const event of ["seeking", "ended", "emptied"]) this.video?.addEventListener(event, this.interrupt);
      this.video?.addEventListener("pause", this.pauseWithVideo);
      this.video?.addEventListener("waiting", this.onWaiting);
      this.video?.addEventListener("playing", this.onPlaying);
    }
    if (source !== this.source) {
      this.interrupt();
      this.source = source;
      this.cueEnd = cueEnd ?? (video && Number.isFinite(video.currentTime)
        ? video.currentTime + Math.min(10, Math.max(1.5, source.split(/\s+/).length / 2.7)) : undefined);
    }
    if (cueEnd !== undefined) this.cueEnd = cueEnd;
    if (video && this.cueEnd !== undefined && video.currentTime >= this.cueEnd) { this.stop(); return; }
    this.adjustRate();
    if (this.audio && this.pausedByVideo && video && !video.paused && !video.seeking && !this.buffering && this.enabled) {
      this.pausedByVideo = false;
      this.duck(video);
      const generation = this.generation;
      void this.audio.play().catch(() => {
        if (generation === this.generation) { this.stop(); this.error = "Монгол дууг үргэлжлүүлж чадсангүй."; }
      });
    }
    if (!this.enabled || this.error || !video || video.paused || video.seeking || this.buffering || !source || !translation || this.spoken === source) return;
    this.spoken = source;
    this.preparing = true;
    const generation = this.generation;
    void (async () => {
      try {
        const audioUrl = await this.prepare(source, translation);
        if (!this.enabled || generation !== this.generation) return;
        if (video.paused || video.seeking || this.buffering) { this.spoken = ""; return; }
        if (this.cueEnd !== undefined && this.cueEnd - video.currentTime < 0.2) return;
        const audio = new Audio(audioUrl);
        this.audio = audio;
        audio.preservesPitch = true;
        audio.volume = Math.min(1, video.volume * this.speechGain);
        audio.onloadedmetadata = () => { if (generation === this.generation) this.adjustRate(); };
        this.mixer.attach(audio);
        this.adjustRate();
        this.duck(video);
        audio.onended = () => { if (generation === this.generation) this.stop(); };
        audio.onerror = () => {
          if (generation === this.generation) { this.stop(); this.error = "Монгол дууг тоглуулж чадсангүй."; }
        };
        await audio.play();
      } catch (error) {
        if (generation !== this.generation) return;
        this.stop();
        this.error = error instanceof Error ? error.message : "Монгол дууны алдаа.";
      } finally {
        if (generation === this.generation) this.preparing = false;
      }
    })();
  }

  private adjustRate() {
    if (!this.audio || !this.video) return;
    this.audio.playbackRate = synchronizedSpeechRate(this.audio.duration - this.audio.currentTime,
      this.cueEnd === undefined ? NaN : this.cueEnd - this.video.currentTime, this.video.playbackRate);
    this.audio.muted = this.video.muted;
    this.mixer.update();
  }

  private duck(video: HTMLVideoElement) {
    const volume = video.volume;
    const ducked = volume * this.originalMix;
    if (!video.muted && !this.restoreVolume) {
      video.volume = ducked;
      this.restoreVolume = () => { if (video.volume === ducked) video.volume = volume; };
    }
  }

  async prepare(source: string, translation: string): Promise<string> {
    if (!this.enabled) throw new Error("Монгол дуу унтраалттай байна.");
    const key = JSON.stringify([source, translation]);
    const cached = this.audioCache.get(key);
    if (cached) return cached;
    const existing = this.requests.get(key);
    if (existing) return existing;
    const request = (async () => {
      const reply = await chrome.runtime.sendMessage({ type: "LEARNDUB_TTS", text: translation, sourceText: source });
      if (!reply?.ok || typeof reply.audioUrl !== "string" || !reply.audioUrl.startsWith("data:audio/mpeg;base64,")) {
        throw new Error(reply?.error ?? "Монгол дуу үүссэнгүй.");
      }
      if (this.audioCache.size >= 16) this.audioCache.delete(this.audioCache.keys().next().value!);
      this.audioCache.set(key, reply.audioUrl);
      return reply.audioUrl as string;
    })().finally(() => this.requests.delete(key));
    this.requests.set(key, request);
    return request;
  }

  isPrepared(source: string, translation: string) {
    return this.audioCache.has(JSON.stringify([source, translation]));
  }

  recover() {
    this.error = undefined;
    this.interrupt();
  }

  setMix(speechGain: number, originalMix: number) {
    if (this.audio) this.audio.volume = Math.min(1, this.audio.volume * speechGain / this.speechGain);
    this.speechGain = speechGain;
    this.originalMix = originalMix;
    if (this.restoreVolume && this.video) {
      this.restoreVolume();
      this.restoreVolume = undefined;
      this.duck(this.video);
    }
  }
}
