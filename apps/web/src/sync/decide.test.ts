import { describe, expect, it } from "vitest";
import { decideSync } from "./decide";

describe("decideSync", () => {
  const last = { bankJson: "old", remoteUpdatedAt: "1" };
  it("does nothing when both banks are absent", () => {
    expect(decideSync(undefined, undefined, undefined)).toBe("same");
  });
  it("pushes an existing local bank when remote is absent", () => {
    expect(decideSync("local", undefined, last)).toBe("push");
  });
  it("pulls when local is absent", () => {
    expect(decideSync(undefined, { bankJson: "remote", updatedAt: "2" }, undefined)).toBe("pull");
  });
  it("recognizes identical banks even on first connection", () => {
    expect(decideSync("same", { bankJson: "same", updatedAt: "2" }, undefined)).toBe("same");
  });
  it("asks on first connection with different banks", () => {
    expect(decideSync("local", { bankJson: "remote", updatedAt: "2" }, undefined)).toBe("conflict");
  });
  it("pulls when only remote changed", () => {
    expect(decideSync("old", { bankJson: "remote", updatedAt: "2" }, last)).toBe("pull");
  });
  it("pushes when only local changed", () => {
    expect(decideSync("local", { bankJson: "old", updatedAt: "1" }, last)).toBe("push");
  });
  it("asks when both changed", () => {
    expect(decideSync("local", { bankJson: "remote", updatedAt: "2" }, last)).toBe("conflict");
  });
});
