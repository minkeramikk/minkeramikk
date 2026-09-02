/**
 * R4-I18N / AC2 — la validazione dei segnaposto è BLOCCANTE.
 *
 * Un `{name}` perso o un plurale degradato non è un testo brutto: è un crash di
 * rendering sulla pagina pubblica, scritto da un pannello admin senza deploy.
 * Per questo non si confrontano le graffe con una regex, ma la FIRMA prodotta
 * dallo stesso parser ICU che next-intl usa a runtime.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
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

  // `plural` and `selectordinal` both carry TYPE.plural in the parser's AST —
  // the cardinal/ordinal distinction lives in the separate `pluralType`
  // field. Without reading it, this swap produces the same signature and is
  // waved through as a no-op edit, even though CLDR renders "one/few/other"
  // by different rules for the two keywords.
  it("rejects `plural` swapped for `selectordinal` (same signature, different rules)", () => {
    const result = checkPlaceholders(
      "{n, plural, one {#} other {#}}",
      "{n, selectordinal, one {#} other {#}}"
    );
    expect(result.ok).toBe(false);
  });

  it("rejects a dropped rich-text tag", () => {
    const result = checkPlaceholders(TAGGED, "Se vilkårene.");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("<terms>");
  });

  // AC2's actual crash path: a named argument nested one level down — inside
  // a plural branch, or inside a <tag>'s children — dropped on the "next"
  // side. `collect()` only catches this if it recurses into `option.value`
  // and `element.children`; if it only walked the top level, both drops
  // would sail through as an "accepted wording change" and throw a
  // missing-value error on the public page.
  it("rejects a named argument dropped from inside a plural branch", () => {
    const original = "{count, plural, one {# vare til {name}} other {# varer til {name}}}";
    const dropped = "{count, plural, one {# vare} other {# varer}}";
    const result = checkPlaceholders(original, dropped);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("{name}");
  });

  it("rejects a named argument dropped from inside a <tag>'s children", () => {
    const original = "Hei <b>{name}</b>, takk.";
    const dropped = "Hei <b>der</b>, takk.";
    const result = checkPlaceholders(original, dropped);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("{name}");
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

/**
 * R4-I18N — the "one parser only" invariant (see the module comment at the
 * top of `placeholders.ts`). `@formatjs/icu-messageformat-parser` is pinned
 * to an EXACT version here so the panel validates with the very same parser
 * next-intl renders with (via `intl-messageformat`, which pins the same
 * package exactly too). If the two ever diverge, npm installs a SECOND copy
 * of the parser: this module keeps validating against one parser while the
 * public page renders with another, and a text that passes the panel can
 * still crash the public page. This test fails loudly the moment that
 * happens, instead of relying on the next person to notice the comment.
 *
 * `@formatjs/icu-messageformat-parser`'s `exports` map does not expose
 * `./package.json`, so a plain `require("…/package.json")` is blocked by
 * Node's package-exports enforcement — resolve each package's main entry
 * instead and read `package.json` from that directory.
 */
describe("the ICU parser pin (validate == render)", () => {
  it("stays exactly the version intl-messageformat pins", () => {
    const require = createRequire(import.meta.url);
    const packageJsonNextTo = (specifier: string) => {
      const entry = require.resolve(specifier);
      const dir = entry.slice(0, entry.lastIndexOf("/"));
      return JSON.parse(readFileSync(`${dir}/package.json`, "utf8"));
    };

    const installed = packageJsonNextTo("@formatjs/icu-messageformat-parser");
    const rendererPin = packageJsonNextTo("intl-messageformat");

    expect(installed.version).toBe(
      rendererPin.dependencies["@formatjs/icu-messageformat-parser"]
    );
  });
});
