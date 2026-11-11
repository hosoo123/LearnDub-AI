// Only resume playback that this gate paused, at the same video position.
export class SyncGate {
  enabled = false;
  waiting = false;
  private video: HTMLVideoElement | undefined;
  private position = 0;
  private source = "";
  private attempted = "";
  private observedSource = "";
  private timeout: ReturnType<typeof setTimeout> | undefined;
  private cancel = () => this.release(false);

  update(video: HTMLVideoElement | null, source: string, ready: boolean) {
    if (source !== this.observedSource) {
      this.observedSource = source;
      this.attempted = "";
    }
    if (!this.enabled || !source || !video) { this.release(true); return; }
    if (this.waiting && (video !== this.video || source !== this.source)) this.release(false);
    if (ready) { this.release(true); return; }
    if (this.waiting || video.paused || video.seeking || video.ended || this.attempted === source) return;
    this.video = video;
    this.position = video.currentTime;
    this.source = this.attempted = source;
    this.waiting = true;
    video.addEventListener("seeking", this.cancel);
    video.addEventListener("play", this.cancel);
    video.pause();
    // A disconnected service must never leave the user stuck on pause.
    this.timeout = setTimeout(() => this.release(true), 8000);
  }

  release(resume: boolean) {
    if (this.timeout !== undefined) clearTimeout(this.timeout);
    this.timeout = undefined;
    const video = this.video;
    const owned = this.waiting;
    this.waiting = false;
    this.video = undefined;
    video?.removeEventListener("seeking", this.cancel);
    video?.removeEventListener("play", this.cancel);
    if (resume && owned && video?.isConnected && video.paused && !video.seeking && !video.ended
      && Math.abs(video.currentTime - this.position) < 0.5) {
      void video.play().catch(() => {});
    }
  }

  reset(resume = true) {
    this.release(resume);
    this.attempted = "";
    this.observedSource = "";
  }
}
