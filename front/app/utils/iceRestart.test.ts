import { describe, expect, it } from "vitest";
import { shouldRestartIce, shouldRetryIceRestart } from "./iceRestart";

describe("ICE restart decisions", () => {
  it("does not restart ICE for transports that never connected", () => {
    expect(shouldRestartIce("new")).toBe(false);
    expect(shouldRestartIce("connecting")).toBe(false);
    expect(shouldRestartIce("closed")).toBe(false);
  });

  it("restarts ICE only for transports with an active or broken media path", () => {
    expect(shouldRestartIce("connected")).toBe(true);
    expect(shouldRestartIce("disconnected")).toBe(true);
    expect(shouldRestartIce("failed")).toBe(true);
  });

  it("retries only while the transport is disconnected or failed", () => {
    expect(shouldRetryIceRestart("disconnected")).toBe(true);
    expect(shouldRetryIceRestart("failed")).toBe(true);
    expect(shouldRetryIceRestart("new")).toBe(false);
    expect(shouldRetryIceRestart("connected")).toBe(false);
    expect(shouldRetryIceRestart("closed")).toBe(false);
  });
});
