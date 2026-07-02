import { describe, it, expect, afterEach } from "vitest";
import { isAllowedAdmin } from "./admin-allowlist";

const original = process.env.ADMIN_ALLOWLIST;
afterEach(() => {
  if (original === undefined) delete process.env.ADMIN_ALLOWLIST;
  else process.env.ADMIN_ALLOWLIST = original;
});

describe("isAllowedAdmin", () => {
  it("allows any user when the allowlist is unset (back-compat, no lock-out)", () => {
    delete process.env.ADMIN_ALLOWLIST;
    expect(isAllowedAdmin("whoever@example.com")).toBe(true);
    expect(isAllowedAdmin(null)).toBe(true);
  });

  it("allows any user when the allowlist is blank/whitespace", () => {
    process.env.ADMIN_ALLOWLIST = " , ";
    expect(isAllowedAdmin("whoever@example.com")).toBe(true);
  });

  it("restricts to the listed emails (case-insensitive) when configured", () => {
    process.env.ADMIN_ALLOWLIST = "tech@minkeramikk.no, ops@minkeramikk.no";
    expect(isAllowedAdmin("tech@minkeramikk.no")).toBe(true);
    expect(isAllowedAdmin("TECH@Minkeramikk.NO")).toBe(true);
    expect(isAllowedAdmin("ops@minkeramikk.no")).toBe(true);
    expect(isAllowedAdmin("attacker@evil.com")).toBe(false);
    expect(isAllowedAdmin(null)).toBe(false);
    expect(isAllowedAdmin(undefined)).toBe(false);
  });
});
