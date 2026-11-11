import { describe, expect, it, vi } from "vitest";
import { PendingRequests } from "../extension/src/pending-requests";

describe("shared translation requests", () => {
  it("shares simultaneous identical requests but keeps different contexts separate", async () => {
    const requests = new PendingRequests<string>();
    const operation = vi.fn(async () => "Орчуулга");
    const first = requests.run("same-context", operation);
    const second = requests.run("same-context", operation);
    expect(first).toBe(second);
    await expect(first).resolves.toBe("Орчуулга");
    expect(operation).toHaveBeenCalledOnce();
    await requests.run("different-context", operation);
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("allows a fresh attempt after failure", async () => {
    const requests = new PendingRequests<string>();
    await expect(requests.run("cue", async () => { throw new Error("Offline"); })).rejects.toThrow("Offline");
    await expect(requests.run("cue", async () => "Сэргээлээ")).resolves.toBe("Сэргээлээ");
  });
});
