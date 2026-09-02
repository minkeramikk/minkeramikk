/**
 * R4-I18N / AC2 — la validazione dei segnaposto è BLOCCANTE.
 *
 * Un `{name}` perso o un plurale degradato non è un testo brutto: è un crash di
 * rendering sulla pagina pubblica, scritto da un pannello admin senza deploy.
 * Per questo non si confrontano le graffe con una regex, ma la FIRMA prodotta
 * dallo stesso parser ICU che next-intl usa a runtime.
 */
import { describe, it, expect } from "vitest";
import no from "./messages/no.json";
import { checkPlaceholders, icuSignature } from "./placeholders";
import { flattenMessages } from "./overrides";
import en from "./messages/en.json";

const PLURAL = "{count, plural, =0 {Tom} one {# vare} other {# varer}}";
const TAGGED = "Se våre <terms>salgsvilkår</terms> og <privacy>personvern</privacy>.";

describe("icuSignature", () => {
  it("names arguments, plural branches and tags", () => {
    expect([...icuSignature(PLURAL)]).toEqual([
      "{count, plural}",
      "{count, plural} → =0",
      "{count, plural} → one",
      "{count, plural} → other",
    ]);
    expect([...icuSignature(TAGGED)]).toEqual(["<terms>", "<privacy>"]);
  });

  // Se un testo dei file non fosse ICU valido, l'editor non potrebbe aprirlo:
  // questo test è la garanzia che ogni chiave sia editabile.
  it("parses every string in both message files", () => {
    for (const messages of [no, en]) {
      for (const [key, value] of Object.entries(flattenMessages(messages))) {
        expect(() => icuSignature(value), key).not.toThrow();
      }
    }
  });
});

describe("checkPlaceholders", () => {
  it("accepts a pure wording change", () => {
    expect(checkPlaceholders("Takk!", "Tusen takk!")).toEqual({ ok: true });
  });

  it("accepts the same placeholders in a different order", () => {
    expect(checkPlaceholders("{a} og {b}", "{b} og {a}")).toEqual({ ok: true });
  });

  it("accepts a placeholder repeated (it just renders twice)", () => {
    expect(checkPlaceholders("{amount}", "{amount} ({amount})")).toEqual({ ok: true });
  });

  it("rejects a dropped argument, naming it", () => {
    const result = checkPlaceholders("Hei {name}, takk", "Hei, takk");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("{name}");
  });

  it("rejects an invented argument", () => {
    const result = checkPlaceholders("Takk", "Takk {name}");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("{name}");
  });

  it("rejects a plural degraded to a plain argument", () => {
    const result = checkPlaceholders(PLURAL, "{count} varer");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("{count, plural}");
  });

  it("rejects a dropped rich-text tag", () => {
    const result = checkPlaceholders(TAGGED, "Se vilkårene.");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("<terms>");
  });

  it("rejects a plural missing its `other` branch (ICU refuses it)", () => {
    const result = checkPlaceholders(PLURAL, "{count, plural, one {# vare}}");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("MISSING_OTHER_CLAUSE");
  });

  it("rejects an unbalanced brace", () => {
    const result = checkPlaceholders("Hei {name}", "Hei {name");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("Invalid");
  });

  it("refuses to compare when the original itself is not valid ICU", () => {
    const result = checkPlaceholders("Hei {name", "Hei {name}");
    expect(result.ok).toBe(false);
  });

  it("accepts a real file string edited around its placeholders", () => {
    const original = flattenMessages(no)["configurator.ladder.nudge"];
    expect(checkPlaceholders(original, original)).toEqual({ ok: true });
  });
});
