import { describe, it, expect } from "vitest";
import en from "./messages/en.json";
import no from "./messages/no.json";

/**
 * i18n key parity (F12 DoD): NO and EN must expose the SAME keys, so no page
 * ever renders a missing-key fallback. `_review` is excluded — it's an EN-only
 * marker that the English copy is draft pending client review (AGENTS.md rule 6).
 */
const SKIP_TOP_LEVEL = ["_review"];

function leafKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  let out: string[] = [];
  for (const k of Object.keys(obj)) {
    if (prefix === "" && SKIP_TOP_LEVEL.includes(k)) continue;
    const key = prefix ? `${prefix}.${k}` : k;
    const v = obj[k];
    if (v && typeof v === "object" && !Array.isArray(v)) {
      out = out.concat(leafKeys(v as Record<string, unknown>, key));
    } else {
      out.push(key);
    }
  }
  return out;
}

describe("i18n message parity", () => {
  const enKeys = new Set(leafKeys(en as Record<string, unknown>));
  const noKeys = new Set(leafKeys(no as Record<string, unknown>));

  it("has no EN keys missing from NO", () => {
    expect([...enKeys].filter((k) => !noKeys.has(k))).toEqual([]);
  });

  it("has no NO keys missing from EN", () => {
    expect([...noKeys].filter((k) => !enKeys.has(k))).toEqual([]);
  });

  it("includes the legal copy in both locales", () => {
    for (const k of [
      "legal.terms.title",
      "legal.terms.body",
      "legal.privacy.title",
      "legal.privacy.body",
    ]) {
      expect(enKeys.has(k), `EN ${k}`).toBe(true);
      expect(noKeys.has(k), `NO ${k}`).toBe(true);
    }
  });
});
