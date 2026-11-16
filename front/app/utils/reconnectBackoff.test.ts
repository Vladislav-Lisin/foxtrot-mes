import { describe, expect, it } from "vitest";
import { reconnectDelayMs } from "./reconnectBackoff";

describe("reconnectDelayMs", () => {
  it("uses capped exponential delays with bounded jitter", () => {
    expect(reconnectDelayMs(0, () => 0)).toBe(500);
    expect(reconnectDelayMs(1, () => 1)).toBe(2_000);
    expect(reconnectDelayMs(5, () => 1)).toBe(30_000);
    expect(reconnectDelayMs(20, () => 1)).toBe(30_000);
  });

  it("clamps invalid random values and negative retry counts", () => {
    expect(reconnectDelayMs(-3, () => -1)).toBe(500);
    expect(reconnectDelayMs(0, () => 3)).toBe(1_000);
  });
});
