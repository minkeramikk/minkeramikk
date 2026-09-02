/**
 * R4-I18N — the "migration not applied" branch (`page.tsx`): when the
 * `i18n_overrides` read errors out, the page must show
 * `data-testid="texts-unavailable"` and disable the editor, instead of
 * failing every save with a confusing message (same shape as /admin/discounts
 * before 0034). This is the admin half of the card's most important
 * guarantee, and nothing exercised it.
 *
 * This project's vitest config collects `src/**‍/*.test.ts` only (not
 * `.tsx`), and finding 5 explicitly rules out widening it just for this. A
 * Server Component is, before it ever touches a DOM, a plain async function
 * that returns a React element tree — a nested plain object. Calling
 * `AdminTextsPage()` directly and walking `.props.children` proves the
 * branch without rendering anything, so it stays in a `.ts` file and needs
 * no config change and no browser.
 */
import { describe, it, expect, vi } from "vitest";

type PostgrestResult = { data: unknown[] | null; error: { message: string } | null };

function mockSupabase(result: PostgrestResult) {
  vi.doMock("@/lib/supabase/server", () => ({
    createClient: async () => ({
      from: () => ({ select: async () => result }),
    }),
  }));
}

/** Depth-first search over a React element tree for a node whose props carry
 *  the given `data-testid`, without rendering (no react-dom involved). */
function findByTestId(node: unknown, testId: string): { props?: Record<string, unknown> } | null {
  if (node == null || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findByTestId(child, testId);
      if (found) return found;
    }
    return null;
  }
  const props = (node as { props?: Record<string, unknown> }).props;
  if (props?.["data-testid"] === testId) return node as { props?: Record<string, unknown> };
  return findByTestId(props?.children, testId);
}

/** Same walk, but by element type (`TextsEditor` renders no DOM node of its
 *  own — it's a component reference in the tree, not a `data-testid`). */
function findByType(node: unknown, type: unknown): { props?: Record<string, unknown> } | null {
  if (node == null || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findByType(child, type);
      if (found) return found;
    }
    return null;
  }
  const el = node as { type?: unknown; props?: Record<string, unknown> };
  if (el.type === type) return el;
  return findByType(el.props?.children, type);
}

describe("AdminTextsPage — overrides read fails (migration not applied)", () => {
  it("shows the unavailable notice and disables the editor", async () => {
    vi.resetModules();
    mockSupabase({ data: null, error: { message: "relation \"i18n_overrides\" does not exist" } });
    // Imported dynamically, after the reset, so it resolves to the SAME
    // module instance `page.tsx` imports below — a statically-imported
    // reference here would be a different copy after `resetModules()`.
    const { TextsEditor } = await import("./texts-editor");
    const { default: AdminTextsPage } = await import("./page");

    const element = await AdminTextsPage();

    expect(findByTestId(element, "texts-unavailable")).not.toBeNull();
    const editor = findByType(element, TextsEditor);
    expect(editor?.props?.disabled).toBe(true);
  });
});

describe("AdminTextsPage — overrides read succeeds", () => {
  it("shows no notice and leaves the editor enabled", async () => {
    vi.resetModules();
    mockSupabase({ data: [], error: null });
    const { TextsEditor } = await import("./texts-editor");
    const { default: AdminTextsPage } = await import("./page");

    const element = await AdminTextsPage();

    expect(findByTestId(element, "texts-unavailable")).toBeNull();
    const editor = findByType(element, TextsEditor);
    expect(editor?.props?.disabled).toBe(false);
  });
});
