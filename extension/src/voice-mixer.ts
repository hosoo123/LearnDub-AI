export function voiceBoost(rms: number) {
  return Number.isFinite(rms) && rms > 0.008 ? Math.min(3, Math.max(1, 0.12 / rms)) : 1;
}

// Process only generated speech; never amplify the video's background noise.
export class VoiceMixer {
  private context: AudioContext | undefined;
  private source: MediaElementAudioSourceNode | undefined;
  private analyser: AnalyserNode | undefined;
  private gain: GainNode | undefined;
  private compressor: DynamicsCompressorNode | undefined;
  private samples = new Float32Array(1024);

  attach(audio: HTMLAudioElement) {
    if (typeof AudioContext === "undefined") return;
    try {
      this.context ??= new AudioContext();
      // Keep ordinary HTML audio as the fallback if Web Audio is unavailable.
      if (this.context.state !== "running") return;
      this.disconnect();
      this.source = this.context.createMediaElementSource(audio);
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 1024;
      this.gain = this.context.createGain();
      this.compressor = this.context.createDynamicsCompressor();
      this.compressor.threshold.value = -16;
      this.compressor.knee.value = 18;
      this.compressor.ratio.value = 5;
      this.compressor.attack.value = 0.008;
      this.compressor.release.value = 0.18;
      this.source.connect(this.analyser).connect(this.gain).connect(this.compressor).connect(this.context.destination);
    } catch {
      // If routing already began, retain a direct audible path.
      if (this.source && this.context) {
        this.source.disconnect();
        this.source.connect(this.context.destination);
      }
    }
  }

  unlock() {
    if (typeof AudioContext === "undefined") return;
    try {
      this.context ??= new AudioContext();
      void this.context.resume().catch(() => {});
    } catch { /* Ordinary audio remains available. */ }
  }

  update() {
    if (!this.analyser || !this.gain || !this.context) return;
    this.analyser.getFloatTimeDomainData(this.samples);
    const rms = Math.sqrt(this.samples.reduce((sum, value) => sum + value * value, 0) / this.samples.length);
    // Do not chase silence; cap amplification at 3x and smooth changes.
    const boost = voiceBoost(rms);
    this.gain.gain.setTargetAtTime(boost, this.context.currentTime, 0.15);
  }

  disconnect() {
    this.source?.disconnect();
    this.analyser?.disconnect();
    this.gain?.disconnect();
    this.compressor?.disconnect();
    this.source = undefined;
    this.analyser = undefined;
    this.gain = undefined;
    this.compressor = undefined;
  }
}
