# R2-1 — Cover default per category + mobile "Next step" CTA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the shop choose, from the admin panel, which colour each design shows in the step-1 cover/preview — without reordering the customer-facing option list — and add a sticky mobile "Next step" CTA on step 1.

**Architecture:** Part A adds an additive `options.is_default` boolean (migration 0013) guarded by a partial-unique index, backfilled to today's first-by-`sort_order` so the cover is byte-for-byte unchanged at deploy. A single pure helper `pickDefaultOption` (prefers `is_default`, else first) replaces the three scattered "first option" defaults: the step-1 design-card cover (`designs.ts`), the design-detail data layer (`design-options.ts` → fed to `toCodecDesign`), and the initial URL-less selection. An admin radio in the F22 design tree calls a new `setDefaultOption` server action (RLS authenticated, zod, clear-then-set, 23505 handled by the index). Part B is FE-only: a mobile-only sticky bottom "Next step" bar on step 1 (desktop unchanged, clear of the step-2-only F31 floating preview).

**Tech Stack:** Next.js 15 (App Router) · React 19 · TypeScript strict · Supabase (Postgres + RLS) · Tailwind 4 + shadcn/ui · next-intl · Vitest (unit) · Playwright (e2e).

**PR boundary (WIP=1):** Part A = PR #1 (schema + logic + admin + tests). Part B = PR #2 (mobile CTA). Each PR ends green on `npm run lint && npm run build && npm test && make run-e2e-core`.

**Critical correction to the card's "Base esistente":** The card states the step-1 cover derives from `toCodecDesign`'s `defaultOptionId`. It does **not**. The visible step-1 cover is the design **card** composite, built in `src/lib/catalog/designs.ts` (`loadActiveDesigns`, lines 57–80) from *first-active-by-`sort_order`* per category. `toCodecDesign` only computes the canonical **config code** default. Both must honour `is_default`, plus the URL-less initial selection in `configurator-client.tsx`. All three are covered below.

**Also note:** F21 did **not** ship a `step-nav-mobile` component. It shipped the in-column `data-testid="step-nav-flow"` CTA (`configurator-client.tsx:464-473`) and the clickable `Stepper`. Part B adds a new sticky mobile bar; there is no existing component to "reuse" beyond the `Button` and `goToStep`.

---

## File Structure

**Part A — created**
- `supabase/migrations/0013_options_is_default.sql` — additive column + partial-unique index + idempotent backfill.
- `src/lib/configurator/default-option.ts` — pure `pickDefaultOption` helper (the single source of default-selection truth).
- `src/lib/configurator/default-option.test.ts` — unit tests for the helper.

**Part A — modified**
- `src/lib/supabase/types.ts` — add `is_default` to `options` Row/Insert/Update (regenerated or hand-edited).
- `src/lib/catalog/design-options.ts` — select `is_default`; thread `isDefault` into `CategoryOption`; keep `sort_order` ordering.
- `src/lib/configurator/config-code.ts` — `toCodecDesign` input gains `isDefault`; `defaultOptionId` via `pickDefaultOption`.
- `src/lib/configurator/config-code.test.ts` — add cases: default-selection prefers `is_default`, falls back to first.
- `src/lib/catalog/designs.ts` — `loadActiveDesigns` picks the default option (not blindly `[0]`) for the cover layers.
- `src/app/admin/designs/options-actions.ts` — new `setDefaultOption` server action.
- `src/components/admin/design-tree.tsx` — `OptionSlot.isDefault`; default radio per option row.
- `src/app/admin/designs/[id]/page.tsx` — select `is_default`; pass into `OptionSlot`; preview sidebar uses default (not first).
- `e2e/configurator.spec.ts` — desktop test: change default in F10 → step-1 cover of that design changes (runtime-discovered, no hardcoded colour).

**Part B — modified**
- `src/app/[locale]/(public)/configurator/configurator-client.tsx` — mobile-only sticky bottom "Next step" bar on step 1.
- `src/i18n/messages/en.json`, `src/i18n/messages/no.json` — reuse/confirm `configurator.teaser.nextStep`; no new key unless missing.
- `e2e/configurator.spec.ts` — mobile @390 test: "Next step" reachable without scrolling.

---

# PART A — PR #1: `is_default` per category

## Task A1: Migration 0013 — column, partial-unique index, backfill

**Files:**
- Create: `supabase/migrations/0013_options_is_default.sql`

Mirrors the additive style of `0009_options_unique.sql` (partial unique index) and the backfill style of `0008_theme_base.sql`. The current `options` table (`0001_schema.sql:61-71`) has `category_id`, `sort_order int default 0`, `active boolean default true`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0013_options_is_default.sql`:

```sql
-- 0013_options_is_default.sql — R2-1a: shop-chosen cover colour per category.
-- Additive, no reset (real orders exist — AGENTS.md DB rule). Re-runnable.
--
-- Before this, the step-1 cover used each category's FIRST option by sort_order,
-- which forced the shop to reorder the customer-facing list to change the cover.
-- `is_default` decouples the cover from sort_order: the app prefers the flagged
-- option, falling back to first-by-sort_order when none is flagged.
--
-- Guard: at most ONE default per category at the DB level (a partial unique
-- index, same pattern as 0009). The app also clears the previous default before
-- setting a new one; the index is the safety net (23505 handled in the action).
--
-- Backfill: flag today's first ACTIVE option (by sort_order) per category, so the
-- cover of every design is IDENTICAL to before until the shop changes it. The
-- WHERE NOT EXISTS clause makes the backfill idempotent (a re-run is a no-op).
--
-- Indexes/columns: `is_default` IS in the generated types — regenerate or
-- hand-edit src/lib/supabase/types.ts (Task A2).

alter table options
  add column if not exists is_default boolean not null default false;

create unique index if not exists options_one_default_per_category
  on options (category_id)
  where is_default;

-- Idempotent backfill: per category, flag the first active option by sort_order
-- (tie-break by id for determinism). Skips categories that already have a default.
with ranked as (
  select id,
         row_number() over (
           partition by category_id
           order by sort_order asc, id asc
         ) as rn
  from options
  where active
)
update options o
set is_default = true
from ranked r
where o.id = r.id
  and r.rn = 1
  and not exists (
    select 1 from options d
    where d.category_id = o.category_id and d.is_default
  );
```

- [ ] **Step 2: Apply locally and verify the backfill**

Run:
```bash
nvm use && supabase db push
```
Expected: migration applies cleanly. Verify exactly one default per category and that it equals the first active option:
```bash
supabase db execute --sql "select category_id, count(*) filter (where is_default) as defaults from options group by category_id having count(*) filter (where is_default) <> 1;"
```
Expected: **0 rows** (every category with ≥1 active option has exactly one default; categories with no active options legitimately have zero — confirm that case is empty or expected).

- [ ] **Step 3: Verify idempotency (re-run is a no-op)**

Run the backfill `UPDATE ... WITH ranked` block again manually:
```bash
supabase db execute --sql "with ranked as (select id, row_number() over (partition by category_id order by sort_order asc, id asc) as rn from options where active) update options o set is_default = true from ranked r where o.id = r.id and r.rn = 1 and not exists (select 1 from options d where d.category_id = o.category_id and d.is_default);"
```
Expected: `UPDATE 0`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0013_options_is_default.sql
git commit -m "feat(options): add is_default column + per-category unique index + backfill (R2-1a)"
```

---

## Task A2: Regenerate Supabase types for `is_default`

**Files:**
- Modify: `src/lib/supabase/types.ts` (the `public.Tables.options` block — Row ~173, Insert, Update)

The generator is the source of truth. If the CLI generator is wired, use it; otherwise hand-edit to match exactly what the generator would emit (boolean, required in Row, optional in Insert/Update).

- [ ] **Step 1: Regenerate (preferred)**

Run (project id from `supabase/config.toml` or `.env.local`):
```bash
supabase gen types typescript --linked > src/lib/supabase/types.ts
```
Expected: only the `options` block changes — `is_default: boolean` added to `Row`, `is_default?: boolean` to `Insert` and `Update`. Review the diff: **no other table should change**. If the diff is noisy (column reordering, unrelated tables), discard and hand-edit instead (Step 2).

- [ ] **Step 2: Hand-edit fallback (if generator unavailable or diff noisy)**

In `src/lib/supabase/types.ts`, in `options.Row` add (keep alphabetical/existing order — `hex` then `id`):
```typescript
        is_default: boolean
```
In `options.Insert`:
```typescript
        is_default?: boolean
```
In `options.Update`:
```typescript
        is_default?: boolean
```

- [ ] **Step 3: Typecheck**

Run:
```bash
npx tsc --noEmit
```
Expected: PASS (no new errors from the type change alone).

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase/types.ts
git commit -m "chore(types): regenerate supabase types for options.is_default"
```

---

## Task A3: Pure `pickDefaultOption` helper (TDD)

**Files:**
- Create: `src/lib/configurator/default-option.ts`
- Test: `src/lib/configurator/default-option.test.ts`

This is the single default-selection rule used by every call site. Callers pass options **already ordered by `sort_order`**; the helper returns the flagged option, else the first, else `undefined`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/configurator/default-option.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { pickDefaultOption } from "./default-option";

interface Opt {
  id: string;
  isDefault?: boolean;
}

describe("pickDefaultOption", () => {
  it("returns the option flagged is_default, even when it is not first", () => {
    const opts: Opt[] = [
      { id: "a" },
      { id: "b", isDefault: true },
      { id: "c" },
    ];
    expect(pickDefaultOption(opts)?.id).toBe("b");
  });

  it("falls back to the first option when none is flagged", () => {
    const opts: Opt[] = [{ id: "a" }, { id: "b" }];
    expect(pickDefaultOption(opts)?.id).toBe("a");
  });

  it("returns undefined for an empty list", () => {
    expect(pickDefaultOption([] as Opt[])).toBeUndefined();
  });

  it("returns the first flagged when several are flagged (defensive — DB index forbids it)", () => {
    const opts: Opt[] = [
      { id: "a", isDefault: true },
      { id: "b", isDefault: true },
    ];
    expect(pickDefaultOption(opts)?.id).toBe("a");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
npx vitest run src/lib/configurator/default-option.test.ts
```
Expected: FAIL — `Cannot find module './default-option'`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/configurator/default-option.ts`:

```typescript
/**
 * The default option of a category: the one flagged `is_default`, otherwise the
 * first. Callers pass options ALREADY ordered by sort_order, so "first" means
 * first-by-sort_order — preserving pre-R2-1 behaviour when nothing is flagged.
 *
 * Single source of truth for the cover/preview default (R2-1a). Used by the
 * step-1 design-card cover (designs.ts), the design-detail layer
 * (design-options.ts → toCodecDesign), and the URL-less initial selection.
 */
export function pickDefaultOption<T extends { isDefault?: boolean }>(
  options: readonly T[]
): T | undefined {
  return options.find((o) => o.isDefault) ?? options[0];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
npx vitest run src/lib/configurator/default-option.test.ts
```
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/configurator/default-option.ts src/lib/configurator/default-option.test.ts
git commit -m "feat(configurator): add pickDefaultOption helper (is_default else first)"
```

---

## Task A4: Thread `is_default` through the design-detail data layer

**Files:**
- Modify: `src/lib/catalog/design-options.ts` (interface `CategoryOption` ~lines 7-14; select ~line 71; map ~lines 92-100)

This feeds `toCodecDesign` and the big preview. We add `is_default` to the select, keep sorting by `sort_order`, and expose `isDefault` on `CategoryOption`.

- [ ] **Step 1: Add `isDefault` to the `CategoryOption` interface**

In `src/lib/catalog/design-options.ts`, change:
```typescript
export interface CategoryOption {
  id: string;
  code: string | null;
  name: string;
  image: string | null;
  hex: string | null;
  layerImage: string | null;
}
```
to:
```typescript
export interface CategoryOption {
  id: string;
  code: string | null;
  name: string;
  image: string | null;
  hex: string | null;
  layerImage: string | null;
  isDefault: boolean;
}
```

- [ ] **Step 2: Select `is_default` in the query**

Change the nested options select (line ~71) from:
```typescript
      "id, slug, label_no, label_en, kind, layer_slot, sync_group, sort_order, options(id, code, name, image, hex, layer_image, sort_order, active)"
```
to:
```typescript
      "id, slug, label_no, label_en, kind, layer_slot, sync_group, sort_order, options(id, code, name, image, hex, layer_image, sort_order, active, is_default)"
```

- [ ] **Step 3: Map `is_default` into the returned option (keep sort_order ordering)**

Change the option map (lines ~93-100) from:
```typescript
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((o) => ({
          id: o.id,
          code: o.code,
          name: o.name,
          image: o.image,
          hex: o.hex,
          layerImage: o.layer_image,
        })),
```
to:
```typescript
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((o) => ({
          id: o.id,
          code: o.code,
          name: o.name,
          image: o.image,
          hex: o.hex,
          layerImage: o.layer_image,
          isDefault: o.is_default,
        })),
```

- [ ] **Step 4: Typecheck**

Run:
```bash
npx tsc --noEmit
```
Expected: PASS. (If `toCodecDesign`'s input type now mismatches, that is fixed in Task A5 — but `design-options.ts` itself should compile since it only *adds* a field.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/catalog/design-options.ts
git commit -m "feat(catalog): expose options.is_default in design-detail layer (R2-1a)"
```

---

## Task A5: `toCodecDesign` honours `is_default` (TDD)

**Files:**
- Modify: `src/lib/configurator/config-code.ts` (input type ~lines 51-58; `defaultOptionId` ~line 69)
- Test: `src/lib/configurator/config-code.test.ts` (fixtures ~lines 14-25; add a `toCodecDesign` describe block)

`toCodecDesign` currently sets `defaultOptionId = c.options[0]?.id ?? null`. We add `isDefault` to its input option shape and select via `pickDefaultOption`. `optionCodeToId` mapping is unchanged; options stay ordered by `sort_order` (the caller already sorts).

- [ ] **Step 1: Write the failing test**

In `src/lib/configurator/config-code.test.ts`, add to the imports:
```typescript
import { toCodecDesign } from "./config-code";
```
Then append a new describe block at the end of the file:

```typescript
describe("toCodecDesign defaultOptionId", () => {
  function detail(opts: { id: string; code: string; isDefault?: boolean }[]) {
    return {
      code: "D1",
      slug: "d1",
      categories: [{ slug: "color", options: opts }],
    };
  }

  it("prefers the option flagged is_default, even when not first", () => {
    const codec = toCodecDesign(
      detail([
        { id: "o1", code: "a" },
        { id: "o2", code: "b", isDefault: true },
        { id: "o3", code: "c" },
      ])
    );
    expect(codec?.categories[0]?.defaultOptionId).toBe("o2");
  });

  it("falls back to the first option when none is flagged (pre-R2-1 behaviour)", () => {
    const codec = toCodecDesign(
      detail([
        { id: "o1", code: "a" },
        { id: "o2", code: "b" },
      ])
    );
    expect(codec?.categories[0]?.defaultOptionId).toBe("o1");
  });

  it("keeps the full code→id map regardless of which option is default", () => {
    const codec = toCodecDesign(
      detail([
        { id: "o1", code: "a" },
        { id: "o2", code: "b", isDefault: true },
      ])
    );
    expect(codec?.categories[0]?.optionCodeToId).toEqual({ a: "o1", b: "o2" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
npx vitest run src/lib/configurator/config-code.test.ts
```
Expected: FAIL — first new test expects `"o2"` but current code returns `"o1"` (first option). (Compile may also fail because the input type lacks `isDefault`; that is fixed in Step 3.)

- [ ] **Step 3: Update `toCodecDesign`**

In `src/lib/configurator/config-code.ts`, add the import at the top (next to existing imports):
```typescript
import { pickDefaultOption } from "./default-option";
```
Change the function input type and `defaultOptionId` computation. From:
```typescript
export function toCodecDesign(detail: {
  code: string | null;
  slug: string;
  categories: {
    slug: string;
    options: { id: string; code: string | null }[];
  }[];
}): CodecDesign | null {
  if (!detail.code) return null;
  return {
    code: detail.code,
    slug: detail.slug,
    categories: detail.categories.map((c) => {
      const optionCodeToId: Record<string, string> = {};
      for (const o of c.options) if (o.code) optionCodeToId[o.code] = o.id;
      return {
        slug: c.slug,
        optionCodeToId,
        defaultOptionId: c.options[0]?.id ?? null,
      };
    }),
  };
}
```
to:
```typescript
export function toCodecDesign(detail: {
  code: string | null;
  slug: string;
  categories: {
    slug: string;
    options: { id: string; code: string | null; isDefault?: boolean }[];
  }[];
}): CodecDesign | null {
  if (!detail.code) return null;
  return {
    code: detail.code,
    slug: detail.slug,
    categories: detail.categories.map((c) => {
      const optionCodeToId: Record<string, string> = {};
      for (const o of c.options) if (o.code) optionCodeToId[o.code] = o.id;
      // R2-1a: cover/code default = is_default else first-by-sort_order. The
      // caller passes options already ordered by sort_order, so this matches
      // pre-R2-1 behaviour whenever nothing is flagged (config codes stay stable
      // — ADR 0011, no churn on existing order_items.config_code).
      return {
        slug: c.slug,
        optionCodeToId,
        defaultOptionId: pickDefaultOption(c.options)?.id ?? null,
      };
    }),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
npx vitest run src/lib/configurator/config-code.test.ts
```
Expected: PASS (all existing tests + 3 new ones).

- [ ] **Step 5: Commit**

```bash
git add src/lib/configurator/config-code.ts src/lib/configurator/config-code.test.ts
git commit -m "feat(configurator): toCodecDesign defaultOptionId honours is_default (R2-1a)"
```

---

## Task A6: Step-1 cover (`designs.ts`) honours `is_default`

**Files:**
- Modify: `src/lib/catalog/designs.ts` (select ~line 40; default-selection ~lines 59-70)

This is the **visible cover**. Today it composes from first-active-by-`sort_order` per category. We add `is_default` to the select and pick via `pickDefaultOption`. There is no unit test harness for `designs.ts` (it hits Supabase); coverage comes from the e2e in Task A9 plus the helper's unit test (A3).

- [ ] **Step 1: Add the import**

In `src/lib/catalog/designs.ts`, add after the existing `preview` import:
```typescript
import { pickDefaultOption } from "@/lib/configurator/default-option";
```

- [ ] **Step 2: Select `is_default` in the nested options query**

Change (line ~40) from:
```typescript
        "id, slug, name, supplier_id, preview_image, sort_order, option_categories(layer_slot, sort_order, options(layer_image, sort_order, active))"
```
to:
```typescript
        "id, slug, name, supplier_id, preview_image, sort_order, option_categories(layer_slot, sort_order, options(layer_image, sort_order, active, is_default))"
```

- [ ] **Step 3: Pick the default option for the cover layers**

Change the `selected` mapping (lines ~59-70) from:
```typescript
    const selected = (d.option_categories ?? [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((c) => {
        const first = (c.options ?? [])
          .filter((o) => o.active)
          .sort((a, b) => a.sort_order - b.sort_order)[0];
        return {
          layerSlot: (c.layer_slot ?? "detail") as LayerSlot,
          layerImage: first?.layer_image ?? null,
        };
      });
```
to:
```typescript
    const selected = (d.option_categories ?? [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((c) => {
        // R2-1a: cover = the option flagged is_default, else first active by
        // sort_order. `pickDefaultOption` takes options already sorted by
        // sort_order, so map snake_case → isDefault and sort first.
        const active = (c.options ?? [])
          .filter((o) => o.active)
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((o) => ({ layerImage: o.layer_image, isDefault: o.is_default }));
        const chosen = pickDefaultOption(active);
        return {
          layerSlot: (c.layer_slot ?? "detail") as LayerSlot,
          layerImage: chosen?.layerImage ?? null,
        };
      });
```

- [ ] **Step 4: Typecheck and build**

Run:
```bash
npx tsc --noEmit && npm run build
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/catalog/designs.ts
git commit -m "feat(catalog): step-1 cover composes from is_default option (R2-1a)"
```

---

## Task A7: URL-less initial selection honours `is_default`

**Files:**
- Modify: `src/app/[locale]/(public)/configurator/configurator-client.tsx` (`resolveSelections` ~lines 42-52)

When the configurator opens with no `opt_*` params, the initial selection per category should be the default option, not blindly `options[0]`. `CategoryOption` now carries `isDefault` (Task A4).

- [ ] **Step 1: Add the import**

In `configurator-client.tsx`, add to the imports:
```typescript
import { pickDefaultOption } from "@/lib/configurator/default-option";
```

- [ ] **Step 2: Use the default for the URL-less fallback**

Change `resolveSelections` from:
```typescript
  for (const cat of detail.categories) {
    const fromUrl = params.get(`opt_${cat.slug}`);
    const valid = cat.options.find((o) => o.id === fromUrl);
    out[cat.slug] = valid?.id ?? cat.options[0]?.id ?? "";
  }
```
to:
```typescript
  for (const cat of detail.categories) {
    const fromUrl = params.get(`opt_${cat.slug}`);
    const valid = cat.options.find((o) => o.id === fromUrl);
    out[cat.slug] = valid?.id ?? pickDefaultOption(cat.options)?.id ?? "";
  }
```

- [ ] **Step 3: Check `featured-thumb.ts` for the same pattern**

Open `src/lib/catalog/featured-thumb.ts` (~line 50): `cat.options.find((o) => o.id === selections[cat.slug]) ?? cat.options[0]`. This is a fallback for a *featured* selection that already carries an explicit `selections` map (saved configs), not a fresh default — leave it as `cat.options[0]` (changing it could alter saved featured thumbnails). Add a one-line comment so the next reader knows it was considered:
```typescript
  // NOTE (R2-1a): intentionally first-option fallback here — these are SAVED
  // featured selections, not a fresh cover; the default lives in designs.ts.
```
Place it directly above the `cat.options.find(...)` line.

- [ ] **Step 4: Typecheck and build**

Run:
```bash
npx tsc --noEmit && npm run build
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/[locale]/(public)/configurator/configurator-client.tsx src/lib/catalog/featured-thumb.ts
git commit -m "feat(configurator): URL-less initial selection uses is_default (R2-1a)"
```

---

## Task A8: `setDefaultOption` server action

**Files:**
- Modify: `src/app/admin/designs/options-actions.ts` (append a new action; reuse existing imports `z`, `revalidatePath`, `revalidateTag`, `createClient`)

Mirrors `saveOption` (lines 43-124): `"use server"` file, zod parse, `await createClient()` (anon key + RLS authenticated — **never** service-role), 23505 handling, `revalidateTag("catalog")` + `revalidatePath`. Logic: clear the category's current default, then set the chosen one. The partial-unique index is the safety net.

- [ ] **Step 1: Add the zod schema and action**

Append to `src/app/admin/designs/options-actions.ts`:

```typescript
const setDefaultSchema = z.object({
  optionId: z.string().uuid(),
  categoryId: z.string().uuid(),
  designId: z.string().uuid(),
});

/**
 * R2-1a: mark one option as the category's cover default. Clears the previous
 * default first, then sets the chosen one. RLS authenticated (anon key client);
 * the partial-unique index `options_one_default_per_category` is the safety net
 * for a concurrent double-set (23505 → friendly message).
 */
export async function setDefaultOption(
  _prev: OptionFormState,
  formData: FormData
): Promise<OptionFormState> {
  const parsed = setDefaultSchema.safeParse({
    optionId: formData.get("optionId") ?? "",
    categoryId: formData.get("categoryId") ?? "",
    designId: formData.get("designId") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { optionId, categoryId, designId } = parsed.data;

  const supabase = await createClient();

  // Clear the current default in this category (no-op if optionId already is it).
  const clear = await supabase
    .from("options")
    .update({ is_default: false })
    .eq("category_id", categoryId)
    .neq("id", optionId);
  if (clear.error) return { error: "Could not update the default." };

  const set = await supabase
    .from("options")
    .update({ is_default: true })
    .eq("id", optionId)
    .eq("category_id", categoryId);
  if (set.error) {
    if (set.error.code === "23505") {
      return { error: "Another default already exists for this category — retry." };
    }
    return { error: "Could not set the default." };
  }

  revalidateTag("catalog");
  revalidatePath(`/admin/designs/${designId}`);
  return { error: null };
}
```

- [ ] **Step 2: Typecheck**

Run:
```bash
npx tsc --noEmit
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/designs/options-actions.ts
git commit -m "feat(admin): setDefaultOption server action (RLS authenticated, R2-1a)"
```

---

## Task A9: Admin default radio in the F22 design tree

**Files:**
- Modify: `src/components/admin/design-tree.tsx` (`OptionSlot` ~lines 34-45; import ~lines 22-25; `TreeOptionRow` ~lines 146-253)
- Modify: `src/app/admin/designs/[id]/page.tsx` (options select ~line 50; `OptionSlot` map ~lines 73-82; preview `firstByCat` ~lines 57-64)

The radio sits in the compact row (before the swatch or in the left cluster). One default per category → grouped by `name={`default-${categoryId}`}`. Submitting calls `setDefaultOption` via `useActionState`.

- [ ] **Step 1: Add `isDefault` to `OptionSlot` and pass it from the page**

In `design-tree.tsx`, extend `OptionSlot`:
```typescript
export interface OptionSlot {
  id: string;
  name: string;
  hex: string | null;
  image: string | null;
  layerImage: string | null;
  code: string | null;
  sortOrder: number;
  active: boolean;
  isDefault: boolean;
}
```

In `src/app/admin/designs/[id]/page.tsx`, add `is_default` to the options select (line ~50):
```typescript
            .select("id, category_id, name, hex, image, layer_image, code, sort_order, active, is_default")
```
And in the `OptionSlot` build (lines ~73-82) add:
```typescript
      active: o.active,
      isDefault: o.is_default,
```

- [ ] **Step 2: Make the admin preview sidebar reflect the default (not first)**

Still in `page.tsx`, the preview uses `firstByCat` (lines ~57-64). Change it to prefer the default option's layer so the sidebar matches the live cover. Replace:
```typescript
  const firstByCat = new Map<string, string | null>();
  for (const o of allOptionsRows) {
    if (!firstByCat.has(o.category_id)) firstByCat.set(o.category_id, o.layer_image);
  }
  const selected: SelectedCategory[] = cats.map((c) => ({
    layerSlot: (c.layer_slot ?? "base") as LayerSlot,
    layerImage: firstByCat.get(c.id) ?? null,
  }));
```
with:
```typescript
  // R2-1a: preview the DEFAULT option's layer per category (matches the live
  // step-1 cover). allOptionsRows is ordered by sort_order, so the first row we
  // see per category is the sort_order fallback; an is_default row overrides it.
  const coverByCat = new Map<string, string | null>();
  for (const o of allOptionsRows) {
    if (!coverByCat.has(o.category_id)) coverByCat.set(o.category_id, o.layer_image);
    if (o.is_default) coverByCat.set(o.category_id, o.layer_image);
  }
  const selected: SelectedCategory[] = cats.map((c) => ({
    layerSlot: (c.layer_slot ?? "base") as LayerSlot,
    layerImage: coverByCat.get(c.id) ?? null,
  }));
```

- [ ] **Step 3: Wire `setDefaultOption` into `TreeOptionRow`**

In `design-tree.tsx`, extend the imports from options-actions:
```typescript
import {
  saveOption,
  deleteOption,
  setDefaultOption,
} from "@/app/admin/designs/options-actions";
```
Inside `TreeOptionRow`, add an action-state hook next to the existing ones (after line ~156):
```typescript
  const [defState, setDefault, settingDefault] = useActionState(setDefaultOption, {
    error: null,
  });
```
Then, in the compact row, insert the default control as the first child of the `<div className="flex items-center gap-2.5">` (before `<OptionSwatch />` at line ~176):
```typescript
        <form action={setDefault} className="flex shrink-0 items-center">
          <input type="hidden" name="optionId" value={option.id} />
          <input type="hidden" name="categoryId" value={categoryId} />
          <input type="hidden" name="designId" value={designId} />
          <button
            type="submit"
            disabled={settingDefault || option.isDefault}
            data-testid="tree-option-default"
            data-default={option.isDefault ? "1" : "0"}
            aria-pressed={option.isDefault}
            aria-label={
              option.isDefault
                ? `${option.name} is the cover default`
                : `Set ${option.name} as the cover default`
            }
            title="Cover default — shown in the configurator step 1"
            className="size-4 rounded-full border border-input disabled:cursor-default aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:ring-2 aria-pressed:ring-primary/30"
          >
            <span className="sr-only">Default</span>
          </button>
        </form>
```
And surface its error next to the delete error (after the `delState.error` block, ~line 252):
```typescript
        {defState.error && (
          <span role="alert" className="text-xs text-destructive">
            {defState.error}
          </span>
        )}
```

- [ ] **Step 4: Build to verify the admin tree compiles and the radio renders**

Run:
```bash
npm run build
```
Expected: PASS. (Manual visual check happens in Step 5's e2e + PR evidence.)

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/design-tree.tsx "src/app/admin/designs/[id]/page.tsx"
git commit -m "feat(admin): cover-default radio in design tree + matching preview (R2-1a)"
```

---

## Task A10: e2e — changing the default in F10 changes the step-1 cover (desktop)

**Files:**
- Modify: `e2e/configurator.spec.ts` (append a test; reuse `adminClient`, `loginAdmin` from `./helpers`)

Resilient per the card: discover the design/category/options at runtime, pick an option that is **not** currently the default, set it via the admin UI radio, then assert the public step-1 design card's composited layers changed. Asserts on the rendered `<img>` `src` set (no hardcoded colour). Restore state at the end.

- [ ] **Step 1: Add the test**

Append to `e2e/configurator.spec.ts` (add `loginAdmin` to the `./helpers` import at the top if not already imported):

```typescript
test("R2-1a: changing the cover default in F10 changes the step-1 cover", async ({
  page,
}) => {
  const db = adminClient();

  // Find a category with ≥2 active options that have a compositing layer, so the
  // cover visibly differs when we switch the default.
  const { data: cats, error } = await db
    .from("option_categories")
    .select(
      "id, design_id, designs(slug, active), options(id, is_default, layer_image, active, sort_order)"
    );
  if (error) throw error;

  const target = (cats ?? [])
    .filter((c: any) => c.designs?.active)
    .map((c: any) => ({
      ...c,
      usable: (c.options ?? [])
        .filter((o: any) => o.active && o.layer_image)
        .sort((a: any, b: any) => a.sort_order - b.sort_order),
    }))
    .find((c: any) => c.usable.length >= 2);

  test.skip(!target, "no category with ≥2 layered active options to switch between");

  const slug = target.designs.slug as string;
  const current = target.usable.find((o: any) => o.is_default) ?? target.usable[0];
  const next = target.usable.find((o: any) => o.id !== current.id);

  const coverSrcs = async () => {
    await page.goto("/no/configurator");
    const card = page
      .getByTestId("design-step")
      .locator(`button[aria-pressed]`)
      .filter({ hasText: target.designs.name ?? "" });
    // Fall back to the matching card by slug-derived selection if name filter is empty.
    const imgs = page.getByTestId("design-step").locator("button[aria-pressed] img");
    await expect(imgs.first()).toBeVisible();
    return imgs.evaluateAll((els) =>
      els.map((e) => (e as HTMLImageElement).getAttribute("src"))
    );
  };

  const before = await coverSrcs();

  // Set the new default via the admin UI (F10 design tree).
  await loginAdmin(page);
  await page.goto(`/admin/designs/${target.design_id}`);
  // Expand the category accordion containing our option, then click its default radio.
  const row = page
    .getByTestId("tree-option-row")
    .filter({ has: page.locator(`[name="optionId"][value="${next.id}"]`) });
  // Accordions may need opening; click the category header until the row is visible.
  if ((await row.count()) === 0 || !(await row.first().isVisible())) {
    await page.getByText("Categories & options").scrollIntoViewIfNeeded();
    for (const header of await page.getByTestId("tree-category-header").all()) {
      await header.click();
      if (await row.first().isVisible().catch(() => false)) break;
    }
  }
  await row.getByTestId("tree-option-default").click();
  await expect(row.getByTestId("tree-option-default")).toHaveAttribute(
    "data-default",
    "1"
  );

  const after = await coverSrcs();
  expect(after).not.toEqual(before);

  // Restore the original default so the suite is order-independent.
  await db.from("options").update({ is_default: false }).eq("category_id", target.id).neq("id", current.id);
  await db.from("options").update({ is_default: true }).eq("id", current.id);
});
```

> **Note on `tree-category-header`:** verify the actual test id of the accordion header in `design-tree.tsx` while wiring this test; if it differs, use the real selector (e.g. a button whose text is the category label). Do not invent a test id — read the component. If the header lacks a stable hook, add `data-testid="tree-category-header"` to it in `design-tree.tsx` as part of this task and commit it with the test.

- [ ] **Step 2: Run the core e2e suite (desktop) for this spec**

Run:
```bash
make run-e2e-grep G=configurator
```
Expected: the new test PASSES on desktop and mobile (it is design-agnostic; `test.skip` if no suitable category). Existing configurator tests still green.

- [ ] **Step 3: Commit**

```bash
git add e2e/configurator.spec.ts
git commit -m "test(e2e): F10 default change updates step-1 cover (R2-1a)"
```

---

## Task A11: Part A — full gate + RLS sanity

**Files:** none (verification only)

- [ ] **Step 1: Lint, build, unit**

Run:
```bash
npm run lint && npm run build && npm test
```
Expected: all PASS. Confirm no i18n keys were added/removed (Part A is admin-only, English) — `no.json`/`en.json` unchanged.

- [ ] **Step 2: Confirm RLS — anon cannot set a default**

The existing `rls.test.ts` covers anon-vs-admin on catalog tables. Verify it still passes and, if `options` writes are not already asserted there, add a focused assertion that an anon client `update({ is_default: true })` on `options` returns zero affected rows / is blocked. Run:
```bash
npx vitest run src/lib/supabase/rls.test.ts
```
Expected: PASS (skips silently if `.env.local` absent — that is the repo convention).

- [ ] **Step 3: Core e2e gate**

Run:
```bash
make run-e2e-core
```
Expected: green (desktop + mobile).

- [ ] **Step 4: Open PR #1**

Branch off `main` (`git switch -c r2-1a-cover-default`), push, open the PR. PR body must include the **evidence** the card requires: F10 before/after the default change + the step-1 cover changing. Leave `STATO.md`/board to the TL/PM (do not commit them — they live outside the repo).

```bash
git switch -c r2-1a-cover-default
git push -u origin r2-1a-cover-default
gh pr create --fill
```

---

# PART B — PR #2: sticky mobile "Next step" CTA on step 1

> Separate PR (WIP=1). FE-only. Branch off `main` (or off the merged Part A).

**Reality check:** there is no `step-nav-mobile` component to reuse. F21 shipped the in-column `data-testid="step-nav-flow"` CTA (`configurator-client.tsx:464-473`) and the clickable `Stepper`. On step 1 mobile, the preview hero is hidden (`max-md:hidden`, line 408) and the F31 floating preview mounts **only on step 2** (`floating-preview.tsx`), so a step-1 mobile sticky bottom bar is clear of both. We add a `md:hidden` sticky bottom CTA; desktop keeps the existing in-column CTA untouched.

## Task B1: Add the sticky mobile CTA on step 1

**Files:**
- Modify: `src/app/[locale]/(public)/configurator/configurator-client.tsx` (step-1 branch, after the design grid `</div>` ~line 454, or as a sibling of the step-1 panel)
- Modify: `src/i18n/messages/en.json`, `src/i18n/messages/no.json` (only if `configurator.teaser.nextStep` is missing — it currently exists as "Next step" / "Neste steg")

`goToStep(2)` already preserves all query params (design + `opt_*` + `lock`), satisfying AC6's "keep the config in the URL". The bar is `fixed` at the bottom on mobile only, ≥44px touch target, distinct test id `next-step-mobile` so it never clashes with the desktop in-column `next-step`.

- [ ] **Step 1: Confirm the i18n key exists**

Read `src/i18n/messages/en.json` and `no.json` for `configurator.teaser.nextStep`. It exists (en: "Next step", no: "Neste steg"). **Reuse it — do not add a new key.** If (and only if) it is absent, add `"nextStep": "Next step"` under `configurator.teaser` in `en.json` and `"nextStep": "Neste steg"  // TODO:nb-review` in `no.json` (both files, same key).

- [ ] **Step 2: Render the sticky mobile bar (step 1 only)**

In `configurator-client.tsx`, inside the `step === 1 ? (...)` branch, immediately after the closing `</div>` of the step-1 panel content (after the `ConfigCodeBar` block, before the branch's closing `</div>` at line ~485), add the sticky bar. Place it so it is a child of the step-1 panel container:

```typescript
            {/* R2-1b: mobile-only sticky CTA — after choosing a design the
                "Next step" is reachable without scrolling to the bottom of the
                grid. Desktop keeps the in-column CTA above (unchanged). Step 1
                only: the F31 floating preview mounts on step 2, so no overlap.
                Keeps the config in the URL via goToStep (design + opt_* + lock). */}
            <div
              data-testid="next-step-mobile-bar"
              className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden"
              style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
            >
              <Button
                size="lg"
                data-testid="next-step-mobile"
                className="min-h-11 w-full"
                onClick={() => goToStep(2)}
              >
                {t("teaser.nextStep")} ›
              </Button>
            </div>
```

- [ ] **Step 3: Prevent the fixed bar from covering the in-column CTA / code bar**

The fixed bar overlays content at the very bottom. Add bottom padding to the step-1 panel on mobile so the last in-column elements remain scrollable above the bar. On the step-1 panel container (`<div className="flex min-w-0 flex-col" data-testid="design-step" ...>`, line ~429) append `max-md:pb-20` to the className:
```typescript
            className="flex min-w-0 flex-col max-md:pb-20"
```

- [ ] **Step 4: Build and visually verify at 390 / 768 / 1280**

Run:
```bash
npm run build
```
Then run the app and check (per DoD responsive rule):
- **390px:** after the page loads on step 1, the "Next step" bar is pinned to the bottom, visible without scrolling, ≥44px tall; tapping it goes to step 2 with the same `?design=...&opt_...` params.
- **768px / 1280px:** the sticky bar is **hidden** (`md:hidden`); the in-column `next-step` CTA is unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/app/[locale]/(public)/configurator/configurator-client.tsx
git commit -m "feat(configurator): sticky mobile Next-step CTA on step 1 (R2-1b)"
```

---

## Task B2: e2e — mobile @390 "Next step" reachable without scrolling

**Files:**
- Modify: `e2e/configurator.spec.ts` (append; runs under the `mobile` project at 390×844)

- [ ] **Step 1: Add the test**

Append to `e2e/configurator.spec.ts`:

```typescript
test("R2-1b: mobile @390 — Next-step CTA is reachable without scrolling", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "mobile",
    "mobile-only CTA (sticky bar is md:hidden)"
  );

  await page.goto("/no/configurator");

  // Choose the first design (the sticky bar is present on step 1 regardless,
  // but AC6 frames it as "after choosing a design").
  await page.getByTestId("design-step").locator("button[aria-pressed]").first().click();

  const cta = page.getByTestId("next-step-mobile");
  await expect(cta).toBeVisible();

  // Reachable WITHOUT scrolling: it is inside the viewport at the initial scroll
  // position (scrollY === 0) and tall enough to tap (≥44px).
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  const box = await cta.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.y + box!.height).toBeLessThanOrEqual(844);

  // Navigates to step 2 keeping the config in the URL.
  await cta.click();
  await expect(page).toHaveURL(/[?&]step=2/);
  await expect(page).toHaveURL(/[?&]design=/);
});
```

- [ ] **Step 2: Run the spec (mobile + desktop)**

Run:
```bash
make run-e2e-grep G=configurator
```
Expected: new mobile test PASSES on the `mobile` project, SKIPS on `desktop`. Existing tests green.

- [ ] **Step 3: Commit**

```bash
git add e2e/configurator.spec.ts
git commit -m "test(e2e): mobile Next-step CTA reachable without scroll (R2-1b)"
```

---

## Task B3: Part B — full gate + i18n parity

**Files:** none (verification only)

- [ ] **Step 1: Lint, build, unit**

Run:
```bash
npm run lint && npm run build && npm test
```
Expected: PASS.

- [ ] **Step 2: i18n parity**

Confirm every configurator key exists in **both** `no.json` and `en.json` (Part B touched at most `teaser.nextStep`, which already exists in both). Quick check:
```bash
node -e "const a=require('./src/i18n/messages/en.json').configurator,b=require('./src/i18n/messages/no.json').configurator;const ka=Object.keys(a.teaser||{}),kb=Object.keys(b.teaser||{});console.log('en',ka,'no',kb);"
```
Expected: identical key sets.

- [ ] **Step 3: Core e2e gate**

Run:
```bash
make run-e2e-core
```
Expected: green (desktop + mobile).

- [ ] **Step 4: Open PR #2**

```bash
git switch -c r2-1b-mobile-cta
git push -u origin r2-1b-mobile-cta
gh pr create --fill
```
PR body includes the **mobile @390 CTA** evidence (screenshot/video). Desktop unchanged. `STATO.md`/board updated by TL/PM (not committed).

---

## Acceptance Criteria coverage

| AC | Where satisfied |
|----|-----------------|
| AC1 — additive migration + partial-unique + sort_order backfill; cover identical post-migration | Task A1 (backfill = first-active-by-sort_order; idempotent) |
| AC2 — F10 sets a different default → persists, clears previous, step-1 cover reflects it without reordering | Tasks A6, A8, A9, A10 |
| AC3 — prefers is_default, falls back to first-by-sort_order; config code stable (no churn) | Tasks A3, A5 (unit-tested; `optionCodeToId` unchanged, default-only change) |
| AC4 — admin-only mutation (RLS authenticated), no service-role client, zod, second default blocked (DB+app) | Task A8 (`createClient()` anon+RLS, zod, clear-then-set, 23505), A1 (index), A11 Step 2 (anon blocked) |
| AC5 — no regression: steps 1/2/3, preview compositing, F04 codes, orders/PDF | Tasks A11 (lint/build/unit/core e2e), A5/A3 (code stability) |
| AC6 — mobile @390 CTA reachable without scrolling, ≥44px, navigates to step 2 keeping config in URL | Tasks B1, B2 |
| AC7 — desktop unchanged; no regression on stepper (F18), floating preview (F31); i18n NO/EN parity | Tasks B1 (`md:hidden`, step-1 only, key reuse), B3 |

## Self-review notes
- **Type consistency:** `pickDefaultOption<T extends { isDefault?: boolean }>` is used with `CategoryOption` (snake→camel mapped in A4), `toCodecDesign` input (A5), `designs.ts` ad-hoc `{ layerImage, isDefault }` (A6), and `cat.options` (A7) — all expose `isDefault`. `OptionSlot.isDefault` (A9) is `boolean` (non-optional) matching the DB `not null default false`.
- **No silent caps:** the A10 e2e `test.skip`s loudly when no suitable category exists (never a hidden pass).
- **DB safety:** only additive migration + `db push` (no reset), per AGENTS.md.
- **Open item to verify during A10:** the real accordion-header test id in `design-tree.tsx` — read the component; add a stable hook if missing rather than guessing.