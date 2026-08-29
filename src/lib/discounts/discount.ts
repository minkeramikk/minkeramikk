/**
 * R4-SCONTI — the discount engine (ADR 0022). PURE: no React, no I/O, no
 * server-only. This is THE single implementation: the cart renders from it and
 * the order route snapshots from it, so the customer and the shop can never see
 * two different numbers.
 *
 * Two mechanics, in order of precedence on a line:
 *   deal  — a fixed % from an admin-authored rule (part ②), independent of the
 *           tiers and alive even when the tiers are switched off.
 *   tier  — the quantity scale, aggregated per product ACROSS designs.
 *
 * All arithmetic goes through the Money VO (ADR 0005); the percentage step is
 * `percentOf`, which rounds ONCE per line.
 */
import {
  money,
  multiply,
  percentOf,
  subtract,
  sum,
  type Currency,
  type Money,
} from "@/lib/money/money";

export interface DiscountTier {
  minQty: number;
  pct: number;
}

/** Part ②; declared here so the config shape never changes shape mid-plan. */
export interface DiscountRule {
  id: string;
  name: string;
  triggerProductIds: string[];
  triggerMinQty: number;
  suggestedProductId: string;
  suggestedQty: number;
  discountMode: "fixed" | "inherited" | "none";
  discountPct: number | null;
  /** R4-SCONTI ②: the suggested product's public card, resolved server-side so
   *  the cart never fetches. Absent until part ② fills it (Task 13).
   *  `image` is a READY-TO-RENDER URL, not a Storage path — config.server.ts
   *  runs it through assetUrl() so the card never has to know where assets
   *  live (same contract as `plateImage` on a cart line). */
  suggested?: {
    id: string;
    slug: string;
    nameNo: string;
    nameEn: string;
    priceCents: number;
    currency: Currency;
    image: string | null;
    pieces: number;
    supplierId: string;
  };
}

export interface DiscountConfig {
  tiersEnabled: boolean;
  tiers: DiscountTier[];
  /** Opt-out multi-select. EMPTY = every product is included (ADR 0022). */
  includedProductIds: string[];
  automationsEnabled: boolean;
  rules: DiscountRule[];
}

/** Everything off — what SSR and a failed config read both render. */
export const EMPTY_CONFIG: DiscountConfig = {
  tiersEnabled: false,
  tiers: [],
  includedProductIds: [],
  automationsEnabled: false,
  rules: [],
};

export interface DiscountLineInput {
  id: string;
  productId: string | null;
  unitPriceCents: number;
  currency: Currency;
  quantity: number;
  /** Part ②: the rule this line was added from. The % is looked up, never sent. */
  dealRuleId?: string;
}

export interface LineDiscount {
  pct: number;
  source: "tier" | "deal" | "none";
  full: Money;
  saved: Money;
  net: Money;
  /** Pieces on the line. */
  quantity: number;
  /**
   * Pieces the discount actually covers. Equal to `quantity` for a tier — the
   * scale is earned by the whole line. For a DEAL it is capped at the rule's
   * `suggestedQty` (ADR 0023): «4 × Deep plate at 50%» is an offer on four
   * pieces, not a 50% licence on the line, so raising the quantity leaves the
   * extra pieces at full price. `pct` therefore describes the covered pieces
   * only — the UI must say so rather than imply a line-wide percentage.
   */
  coveredQty: number;
}

export interface CartDiscount {
  perLine: Record<string, LineDiscount>;
  qtyByProduct: Record<string, number>;
  subtotal: Money;
  tierSaved: Money;
  dealSaved: Money;
  total: Money;
}

const included = (productId: string | null, config: DiscountConfig): boolean =>
  productId !== null &&
  (config.includedProductIds.length === 0 ||
    config.includedProductIds.includes(productId));

// minQty >= 2 mirrors the DB CHECK constraint on tiers (supabase/migrations/0032_discounts_tiers.sql).
const usableTiers = (tiers: DiscountTier[]): DiscountTier[] =>
  tiers
    .filter((t) => t.minQty >= 2 && t.pct > 0)
    .sort((a, b) => b.minQty - a.minQty);

/** The highest tier the quantity reaches; 0 when it reaches none. */
export function tierFor(qty: number, tiers: DiscountTier[]): number {
  for (const t of usableTiers(tiers)) if (qty >= t.minQty) return t.pct;
  return 0;
}

/** The next threshold up — what the cart nudge points at. Null at the top. */
export function nextTier(qty: number, tiers: DiscountTier[]): DiscountTier | null {
  const up = usableTiers(tiers)
    .reverse()
    .find((t) => qty < t.minQty);
  return up ?? null;
}

/**
 * Part ②: the % a rule grants on the line it produced.
 *
 * Re-derives the percentage from the DB config (never trusts a persisted
 * number), and re-checks the two things a persisted `dealRuleId` can outlive:
 * the line must still be the rule's suggested product (localStorage lets a
 * customer forge any enabled rule id onto any line), and the trigger group
 * must still reach `triggerMinQty` (fixed-mode deals don't recompute this on
 * their own the way `inherited` does via `qtyByProduct` — see resolveDeal callers).
 */
/**
 * The percentage a rule grants AND how many pieces it covers. One function
 * answers both because one thing decides both: the rule. `suggestedQty` is the
 * size of the offer, so it is also its ceiling.
 */
function resolveDeal(
  ruleId: string,
  productId: string | null,
  qtyByProduct: Record<string, number>,
  config: DiscountConfig
): { pct: number; suggestedQty: number } {
  const none = { pct: 0, suggestedQty: 0 };
  if (!config.automationsEnabled) return none;
  const rule = config.rules.find((r) => r.id === ruleId);
  if (!rule) return none; // rule deleted/disabled since the line was added
  if (productId !== rule.suggestedProductId) return none; // not entitled to this rule
  const groupQty = rule.triggerProductIds.reduce(
    (n, pid) => n + (qtyByProduct[pid] ?? 0),
    0
  );
  if (groupQty < rule.triggerMinQty) return none; // trigger no longer satisfied
  const q = rule.suggestedQty;
  if (rule.discountMode === "fixed") return { pct: rule.discountPct ?? 0, suggestedQty: q };
  if (rule.discountMode === "inherited") {
    if (!config.tiersEnabled) return none;
    return { pct: tierFor(groupQty, config.tiers), suggestedQty: q };
  }
  return none;
}

export interface ActiveSuggestion {
  rule: DiscountRule;
  /** The line whose design/config the suggested line inherits (ADR 0023 (e)). */
  fromLineId: string;
  pct: number;
}

/**
 * The ONE suggestion to show, or null. One card at a time (spec-sconti.html §2)
 * and the first matching rule in the admin's own order wins — no scoring, no
 * "best offer" heuristic nobody asked for.
 */
export function firstSuggestion(
  lines: DiscountLineInput[],
  config: DiscountConfig,
  opts: {
    dismissedRuleIds: string[];
    supplierOf: (lineId: string) => string | null;
    supplierOfProduct: (productId: string) => string | null;
  }
): ActiveSuggestion | null {
  if (!config.automationsEnabled) return null;

  const qtyByProduct: Record<string, number> = {};
  for (const l of lines) {
    if (!included(l.productId, config)) continue; // excluded ⇒ never a trigger
    qtyByProduct[l.productId as string] =
      (qtyByProduct[l.productId as string] ?? 0) + l.quantity;
  }
  const inCart = new Set(lines.map((l) => l.productId).filter(Boolean) as string[]);

  for (const rule of config.rules) {
    if (opts.dismissedRuleIds.includes(rule.id)) continue;
    if (inCart.has(rule.suggestedProductId)) continue; // D1
    const groupQty = rule.triggerProductIds.reduce(
      (n, pid) => n + (qtyByProduct[pid] ?? 0),
      0
    );
    if (groupQty < rule.triggerMinQty) continue;

    // the line that will lend its config: the biggest trigger line (the one the
    // customer clearly committed to), first-seen on a tie. Same population that
    // fed groupQty — an excluded line never triggers, so it can't donate either.
    const from = lines
      .filter(
        (l) =>
          l.productId &&
          rule.triggerProductIds.includes(l.productId) &&
          included(l.productId, config)
      )
      .sort((a, b) => b.quantity - a.quantity)[0];
    if (!from) continue;

    // same supplier, or the config code means nothing on the suggested product
    const sup = opts.supplierOf(from.id);
    if (!sup || opts.supplierOfProduct(rule.suggestedProductId) !== sup) continue;

    // same fixed/inherited/none resolution resolveDeal() applies to a placed line
    return {
      rule,
      fromLineId: from.id,
      pct: resolveDeal(rule.id, rule.suggestedProductId, qtyByProduct, config).pct,
    };
  }
  return null;
}

export function computeCartDiscount(
  lines: DiscountLineInput[],
  config: DiscountConfig
): CartDiscount {
  const currency: Currency = lines[0]?.currency ?? "NOK";

  // Aggregate per PRODUCT, across designs — the whole point of the mechanic.
  // Excluded products are absent from the map, so they neither earn a tier nor
  // help another line earn one.
  const qtyByProduct: Record<string, number> = {};
  for (const l of lines) {
    if (!included(l.productId, config)) continue;
    qtyByProduct[l.productId as string] =
      (qtyByProduct[l.productId as string] ?? 0) + l.quantity;
  }

  const perLine: Record<string, LineDiscount> = {};
  const fulls: Money[] = [];
  const tierSaves: Money[] = [];
  const dealSaves: Money[] = [];

  for (const l of lines) {
    const full = multiply(money(l.unitPriceCents, l.currency), l.quantity);
    fulls.push(full);

    // deal wins over tier (a fixed rule deal survives the tiers being off)
    let pct = 0;
    let source: LineDiscount["source"] = "none";
    // A tier is earned by the whole line; a deal covers at most the pieces the
    // offer was for (ADR 0023). Without the cap, «4 × Deep plate at 50%» would
    // hand a customer 50% on twenty pieces simply by raising the quantity.
    let coveredQty = l.quantity;
    if (l.dealRuleId) {
      const deal = resolveDeal(l.dealRuleId, l.productId, qtyByProduct, config);
      pct = deal.pct;
      if (pct > 0) {
        source = "deal";
        coveredQty = Math.min(l.quantity, deal.suggestedQty);
      }
    }
    if (source === "none" && config.tiersEnabled && included(l.productId, config)) {
      pct = tierFor(qtyByProduct[l.productId as string] ?? 0, config.tiers);
      if (pct > 0) {
        source = "tier";
        coveredQty = l.quantity;
      }
    }

    // The percentage applies to the COVERED pieces, not to the line total. The
    // amount is what everything downstream reads (build.ts freezes cents,
    // email-html.ts nets off cents, totals and the shipping threshold sum
    // cents) — `pct` is only ever a label, never used to re-derive a price, so
    // capping the base needs no change to the order model.
    const base =
      coveredQty === l.quantity
        ? full
        : multiply(money(l.unitPriceCents, l.currency), coveredQty);
    const saved = pct > 0 ? percentOf(base, pct) : money(0, l.currency);
    perLine[l.id] = {
      pct: source === "none" ? 0 : pct,
      source,
      full,
      saved,
      net: subtract(full, saved),
      quantity: l.quantity,
      coveredQty: source === "none" ? l.quantity : coveredQty,
    };
    if (source === "tier") tierSaves.push(saved);
    if (source === "deal") dealSaves.push(saved);
  }

  const subtotal = sum(fulls, currency);
  const tierSaved = sum(tierSaves, currency);
  const dealSaved = sum(dealSaves, currency);
  return {
    perLine,
    qtyByProduct,
    subtotal,
    tierSaved,
    dealSaved,
    total: subtract(subtract(subtotal, tierSaved), dealSaved),
  };
}

/**
 * R4-SCONTI Task 14, ADR 0023 (e) — authoring-time guard: a suggested product
 * with no supplier in common with its rule's trigger group can never fire,
 * because the suggested line inherits the triggering line's configCode and a
 * config code means nothing across suppliers. Pure (no DB), so the admin
 * action that owns this refusal (src/app/admin/discounts/actions.ts) can
 * derive real suppliers from the DB and hand them to this predicate rather
 * than trusting the browser. Lives here, not in actions.ts, because that file
 * is `"use server"` and every export from it must be an async Server Action.
 */
export function suggestedSharesSupplier(
  triggerSupplierIds: string[],
  suggestedSupplierId: string | undefined
): boolean {
  return Boolean(suggestedSupplierId) && triggerSupplierIds.includes(suggestedSupplierId!);
}
