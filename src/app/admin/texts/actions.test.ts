/**
 * R4-I18N — la validazione della server action. Nessun DB: ognuno di questi
 * casi ritorna PRIMA di `createClient()`, quindi girano anche in CI.
 *
 * Sono i tre vincoli che l'editor non deve poter aggirare: il perimetro (AC4),
 * i segnaposto (AC2) e la parità NO/EN — che è garantita dai file e da
 * `messages.test.ts`, e che una riga di DB non deve poter rompere (NOTA N3).
 */
import { describe, it, expect, vi } from "vitest";
import { updateText } from "./actions";

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
}));

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.append(k, v);
  return data;
}

const OK = {
  intent: "save",
  key: "configurator.step1.hero.title",
  no: "Lag din egen keramikk",
  en: "Make your own ceramics",
};

describe("updateText — validation", () => {
  it("refuses a key outside the whitelist (AC4)", async () => {
    const state = await updateText(
      { error: null },
      form({ ...OK, key: "_review" })
    );
    expect(state.error).toContain("not editable");
    // The editor scopes the error to `state.key === row.key` — no key means
    // the message renders under no row at all (finding 1).
    expect(state.key).toBe("_review");
  });

  it("refuses a key that does not exist in the message files", async () => {
    const state = await updateText(
      { error: null },
      form({ ...OK, key: "cart.doesNotExist" })
    );
    expect(state.error).toContain("not editable");
    expect(state.key).toBe("cart.doesNotExist");
  });

  it("refuses to save Norwegian without English (parity)", async () => {
    const state = await updateText({ error: null }, form({ ...OK, en: "  " }));
    expect(state.error).toContain("Both languages");
    expect(state.key).toBe(OK.key);
  });

  it("refuses a broken placeholder and says which one (AC2)", async () => {
    const state = await updateText(
      { error: null },
      form({
        intent: "save",
        key: "footer.copyright",
        no: "© Min Keramikk",
        en: "© {year} Min Keramikk",
      })
    );
    expect(state.error).toContain("Norwegian");
    expect(state.error).toContain("{year}");
    expect(state.key).toBe("footer.copyright");
  });

  it("refuses a value longer than the column is meant to hold, and names the row", async () => {
    const state = await updateText(
      { error: null },
      form({ ...OK, no: "x".repeat(50001) })
    );
    expect(state.error).toContain("too long");
    // Regression for finding 1: this branch used to return no `key`, so the
    // editor (which renders `state.key === row.key ? state.error : null`)
    // showed nothing at all and the paste looked silently discarded.
    expect(state.key).toBe(OK.key);
  });

  it("refuses an unknown intent", async () => {
    const state = await updateText({ error: null }, form({ ...OK, intent: "drop" }));
    expect(state.error).not.toBeNull();
    expect(state.key).toBe(OK.key);
  });
});
