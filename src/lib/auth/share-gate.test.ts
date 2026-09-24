import { describe, it, expect, vi, afterEach } from "vitest";
import { shareAllowed } from "./share-gate";

describe("shareAllowed", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("denies a null user", () => {
    expect(shareAllowed(null)).toBe(false);
  });

  it("denies an email outside the allowlist", () => {
    vi.stubEnv("ADMIN_ALLOWLIST", "admin@minkeramikk.no");
    expect(shareAllowed({ email: "intruder@example.com" })).toBe(false);
  });

  it("allows an allowlisted admin", () => {
    vi.stubEnv("ADMIN_ALLOWLIST", "admin@minkeramikk.no");
    expect(shareAllowed({ email: "Admin@Minkeramikk.no" })).toBe(true);
  });
});
