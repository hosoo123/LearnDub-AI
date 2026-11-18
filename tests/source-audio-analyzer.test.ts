import { describe, expect, it } from "vitest";
import { deliveryProfile } from "../extension/src/source-audio-analyzer";

describe("source audio delivery analysis", () => {
  it("detects quiet speech with pauses", () => {
    const profile = deliveryProfile([0, 0.005, 0.02, 0.004, 0.018], 1);
    expect(profile.pauseRatio).toBe(0.6);
    expect(profile.loudness).toBeLessThan(0.02);
  });

  it("raises tempo and energy for rapidly changing loud audio", () => {
    const profile = deliveryProfile([0.01, 0.12, 0.02, 0.15, 0.01], 1.25);
    expect(profile.tempo).toBeGreaterThan(1.25);
    expect(profile.energy).toBeGreaterThan(0.3);
  });
});
