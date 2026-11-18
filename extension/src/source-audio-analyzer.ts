export type SourceDeliveryProfile = { loudness: number; pauseRatio: number; tempo: number; energy: number };

export function deliveryProfile(samples: readonly number[], playbackRate = 1): SourceDeliveryProfile {
  if (!samples.length) return { loudness: 0, pauseRatio: 1, tempo: playbackRate, energy: 0 };
  const loudness = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  const pauseRatio = samples.filter((value) => value < 0.012).length / samples.length;
  const transitions = samples.slice(1).reduce((count, value, index) =>
    count + (Math.abs(value - samples[index]) > 0.025 ? 1 : 0), 0);
  const activity = samples.length > 1 ? transitions / (samples.length - 1) : 0;
  const tempo = Math.min(1.6, Math.max(0.7, playbackRate * (0.9 + activity * 0.8)));
  const peak = Math.max(...samples);
  const energy = Math.min(1, loudness * 5 + peak * 2);
  return { loudness, pauseRatio, tempo, energy };
}

type CapturableVideo = HTMLVideoElement & { captureStream?: () => MediaStream };

export class SourceAudioAnalyzer {
  private video: HTMLVideoElement | undefined;
  private context: AudioContext | undefined;
  private source: MediaStreamAudioSourceNode | undefined;
  private analyser: AnalyserNode | undefined;
  private stream: MediaStream | undefined;
  private values = new Float32Array(512);
  private history: number[] = [];

  sample(video: HTMLVideoElement | null) {
    if (video !== this.video) this.attach(video);
    if (!video || !this.analyser) return;
    this.analyser.getFloatTimeDomainData(this.values);
    const rms = Math.sqrt(this.values.reduce((sum, value) => sum + value * value, 0) / this.values.length);
    this.history.push(rms);
    if (this.history.length > 40) this.history.shift();
  }

  get profile() {
    return deliveryProfile(this.history, this.video?.playbackRate ?? 1);
  }

  private attach(video: HTMLVideoElement | null) {
    this.disconnect();
    this.video = video ?? undefined;
    if (!video || typeof AudioContext === "undefined") return;
    try {
      const stream = (video as CapturableVideo).captureStream?.();
      if (!stream?.getAudioTracks().length) return;
      this.context = new AudioContext();
      void this.context.resume().catch(() => {});
      this.stream = stream;
      this.source = this.context.createMediaStreamSource(stream);
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 512;
      this.source.connect(this.analyser);
    } catch { this.disconnect(); this.video = video; }
  }

  disconnect() {
    this.source?.disconnect();
    this.analyser?.disconnect();
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    void this.context?.close().catch(() => {});
    this.source = this.analyser = this.stream = this.context = undefined;
    this.history = [];
  }
}
