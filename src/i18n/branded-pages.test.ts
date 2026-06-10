import { describe, it, expect } from "vitest";
import en from "./messages/en.json";
import no from "./messages/no.json";

/**
 * CQ-2 — the branded error.tsx / not-found.tsx pages read these keys. A missing
 * or empty value would show the customer a broken page, so guard them in both
 * locales (in addition to the general NO/EN parity in messages.test).
 */
const REQUIRED: Record<string, string[]> = {
  error: ["title", "body", "retry", "cta"],
  notFound: ["title", "body", "cta"],
};

describe("branded error/not-found copy", () => {
  for (const [locale, msgs] of [
    ["no", no],
    ["en", en],
  ] as const) {
    for (const [ns, keys] of Object.entries(REQUIRED)) {
      for (const k of keys) {
        it(`${locale}: ${ns}.${k} is a non-empty string`, () => {
          const v = (msgs as Record<string, Record<string, unknown>>)[ns]?.[k];
          expect(typeof v).toBe("string");
          expect((v as string).trim().length).toBeGreaterThan(0);
        });
      }
    }
  }
});
