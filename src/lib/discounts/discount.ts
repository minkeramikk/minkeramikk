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
  /**
   * The line's configurator code. Only the suggestion donor reads it, to prefer
   * the design the customer is looking at right now over the merely biggest
   * line. Optional: a cart saved before this existed simply never matches, and
   * the donor falls back to quantity as it always did.
   */
  configCode?: string;
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
  /**
   * Whether the TIER nudge may speak for this line. False when the tiers are
   * switched off, when the product is outside the inclusion multi-select, or
   * when the line already carries a deal — in that last case the tier scale is
   * not just irrelevant, it contradicts the offer ("−50% · add 4 more → 8%"
   * invites the customer to make things worse).
   *
   * It lives here, computed once beside the discount itself, so the two cart
   * surfaces cannot drift: the nudge asks this instead of re-deriving
   * eligibility from `discountConfig`, which the server loads in full whether
   * the feature is on or not.
   */
  tierEligible: boolean;
  /**
   * Set when the line carries a rule whose offer it does not yet REACH — the
   * customer accepted "N pieces at X%" and then went below N. The discount is
   * correctly absent; without saying so the price simply changes and the shop
   * looks broken. Carries the rule's own numbers so the nudge can explain in
   * the offer's terms rather than the tier scale's.
   */
  pendingDeal?: { missing: number; pct: number };
}

export interface CartDiscount {
  perLine: Record<string, LineDiscount>;
  qtyByProduct: Record<string, number>;
  subtotal: Money;
  tierSaved: Money;
  dealSaved: Money;
  total: Money;
}

export const included = (productId: string | null, config: DiscountConfig): boolean =>
  productId !== null &&
  (config.includedProductIds.length === 0 ||
    config.includedProductIds.includes(productId));

// minQty >= 2 mirrors the DB CHECK constraint on tiers (supabase/migrations/0032_discounts_tiers.sql).
export const usableTiers = (tiers: DiscountTier[]): DiscountTier[] =>
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
 * Whether a rule's offer applies to this line, and on what terms.
 *
 * Re-derives the percentage from the DB config (never trusts a persisted
 * number), and re-checks what a persisted `dealRuleId` can outlive: the line
 * must still be the rule's suggested product (localStorage lets a customer forge
 * any enabled rule id onto any line), and the rule must still have a budget.
 *
 * The two edges of the offer are asymmetric (ADR 0025). BELOW: `suggestedQty` is
 * the offer's own size and nothing is owed under it — that is `short`. ABOVE: the
 * offer applies once every `triggerMinQty` FULL-PRICE pieces, so the ceiling is
 * `maxCoveredQty`, not `suggestedQty`. The admin writes "N pieces at X% for every
 * M in the basket"; the shop honours exactly that.
 *
 * `short` is not a failure: it is the offer standing, unmet. The caller lets
 * the line fall through to the ordinary tier path and tells the customer what
 * is missing, which is why the numbers travel with it.
 */
type DealResolution =
  | { kind: "none" }
  | { kind: "short"; missing: number; pct: number }
  | { kind: "applies"; pct: number; maxCoveredQty: number };

/**
 * PASS 1 (ADR 0025) — the units at FULL price, per product.
 *
 * The criterion is IDENTITY, not price: a line contributes to its product's pool
 * unless it carries a `dealRuleId` matching a live rule for that product. This is
 * what breaks the circularity — the pool would depend on the coverages and the
 * coverages on the pool — without any recursion: here we need not know how much
 * that line discounts, only that it is an offer line.
 *
 * Deliberately CONSERVATIVE: a line carrying a rule id feeds no pool even if its
 * deal turns out not to apply (trigger gone, 0%). It errs on the shop's side, and
 * no 4 → 8 → 16 chain can start.
 */
export function fullPricePool(
  lines: DiscountLineInput[],
  config: DiscountConfig
): Record<string, number> {
  const pool: Record<string, number> = {};
  for (const l of lines) {
    if (!included(l.productId, config)) continue; // excluded ⇒ never a trigger
    const isDealUnit =
      l.dealRuleId !== undefined &&
      config.rules.some(
        (r) => r.id === l.dealRuleId && r.suggestedProductId === l.productId
      );
    if (isDealUnit) continue; // INVARIANT: discounted units count for no offer
    pool[l.productId as string] = (pool[l.productId as string] ?? 0) + l.quantity;
  }
  return pool;
}

/** The rule's budget: `floor(pool / triggerMinQty)` applications × `suggestedQty`. */
function maxCoveredFor(rule: DiscountRule, pool: Record<string, number>): number {
  const poolQty = rule.triggerProductIds.reduce((n, pid) => n + (pool[pid] ?? 0), 0);
  return Math.floor(poolQty / rule.triggerMinQty) * rule.suggestedQty;
}

export interface DealAllocation {
  /** Pass 1: full-price units per product. */
  pool: Record<string, number>;
  /** Per rule: how many units the offer may cover in total. */
  maxCovered: Record<string, number>;
  /** Per rule: how much of that budget is still unassigned. */
  remaining: Record<string, number>;
  /** Per line: the rule's verdict and the units it actually got. */
  byLine: Record<string, { deal: DealResolution; covered: number }>;
}

/**
 * PASS 2 (ADR 0025) — the assignment. A rule's budget is consumed in CART ORDER:
 * two lines carrying the same rule SHARE it instead of both taking it whole,
 * which was the "the trigger is never consumed" bug.
 *
 * Exported because `activeSuggestions` asks it the mirror question — is there any
 * budget left to offer? — and the two must not answer it differently.
 */
export function allocateDeals(
  lines: DiscountLineInput[],
  config: DiscountConfig,
  qtyByProduct: Record<string, number>
): DealAllocation {
  const pool = fullPricePool(lines, config);
  const maxCovered: Record<string, number> = {};
  const remaining: Record<string, number> = {};
  for (const rule of config.rules) {
    maxCovered[rule.id] = maxCoveredFor(rule, pool);
    remaining[rule.id] = maxCovered[rule.id];
  }

  const byLine: DealAllocation["byLine"] = {};
  for (const l of lines) {
    if (!l.dealRuleId) continue;
    const deal = resolveDeal(
      l.dealRuleId,
      l.productId,
      l.quantity,
      { pool, qtyByProduct, maxCovered },
      config
    );
    let covered = 0;
    if (deal.kind === "applies") {
      covered = Math.min(l.quantity, remaining[l.dealRuleId] ?? 0);
      remaining[l.dealRuleId] = (remaining[l.dealRuleId] ?? 0) - covered;
    }
    byLine[l.id] = { deal, covered };
  }
  return { pool, maxCovered, remaining, byLine };
}

function resolveDeal(
  ruleId: string,
  productId: string | null,
  quantity: number,
  ctx: {
    pool: Record<string, number>;
    qtyByProduct: Record<string, number>;
    maxCovered: Record<string, number>;
  },
  config: DiscountConfig
): DealResolution {
  const none: DealResolution = { kind: "none" };
  if (!config.automationsEnabled) return none;
  const rule = config.rules.find((r) => r.id === ruleId);
  if (!rule) return none; // rule deleted/disabled since the line was added
  if (productId !== rule.suggestedProductId) return none; // not entitled to this rule

  // The TRIGGER is the full-price pool, no longer `qtyByProduct`: an offer cannot
  // fire on the units it discounted itself (ADR 0025). A budget of 0 means the
  // trigger is not reached — the old `groupQty < triggerMinQty` check lives here.
  const maxCoveredQty = ctx.maxCovered[rule.id] ?? 0;
  if (maxCoveredQty <= 0) return none;

  let pct = 0;
  if (rule.discountMode === "fixed") pct = rule.discountPct ?? 0;
  else if (rule.discountMode === "inherited") {
    if (!config.tiersEnabled) return none;
    // The inherited PERCENTAGE stays the tier the trigger group earns: the tier is
    // the other mechanic and counts every unit (ADR 0022). The pool governs HOW
    // MANY TIMES the offer applies, not at what percentage.
    const groupQty = rule.triggerProductIds.reduce(
      (n, pid) => n + (ctx.qtyByProduct[pid] ?? 0),
      0
    );
    pct = tierFor(groupQty, config.tiers);
  }
  if (pct <= 0) return none; // mode "none", or an inherited tier that pays nothing

  // The floor. Below the offer's own size there is no offer — reducing the
  // quantity after accepting must not keep the percentage on pieces the rule
  // never covered. Same rule for every mode and every suggestedQty; with
  // suggestedQty 1 (a presence rule) any quantity >= 1 clears it.
  if (quantity < rule.suggestedQty) {
    return { kind: "short", missing: rule.suggestedQty - quantity, pct };
  }
  return { kind: "applies", pct, maxCoveredQty };
}

/**
 * What the basket saves in total — tier and deal together.
 *
 * Derived rather than summed from `tierSaved + dealSaved` so it cannot drift
 * from the total the customer is actually shown: `total` is what they pay,
 * `subtotal` is what the lines add up to, and the gap between the two IS the
 * saving by construction.
 */
export function cartSaved(d: CartDiscount): Money {
  return subtract(d.subtotal, d.total);
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
/**
 * How many offers the cart may show at once (TL ruling, 2026-08-31). Beyond
 * this the block stops being a suggestion and becomes a catalogue; rules past
 * the cap are simply not shown, with no error and no reordering.
 */
export const MAX_SUGGESTIONS = 3;

/**
 * Every offer the cart can show right now, in the admin's own order.
 *
 * Ordered, not ranked: no scoring and no "best offer" heuristic — the shop
 * decides precedence by arranging its rules, and the cart honours that. Was
 * `firstSuggestion` returning one; showing a single card meant the second rule
 * an admin configured was reachable only by dismissing the first, so most
 * customers never saw it and the admin page promised what the shop did not
 * deliver.
 *
 * The filters: an offer already taken in full is skipped (D1, ADR 0025 — it used
 * to be "a product already in the cart"), the suggested product must share the
 * donor's supplier (D2) AND belong to the donor design's own whitelist (D3,
 * R4-FIX Ⓔ), and an excluded product neither triggers nor donates.
 */
export function activeSuggestions(
  lines: DiscountLineInput[],
  config: DiscountConfig,
  opts: {
    supplierOf: (lineId: string) => string | null;
    supplierOfProduct: (productId: string) => string | null;
    /**
     * R4-FIX Ⓔ — D3: is `productId` one of the ceramics the DONOR line's design
     * offers (`design_products`, ADR 0017)? The suggested line inherits the
     * donor's design (ADR 0023 (e)), so a suggestion outside that whitelist is
     * an order the workshop cannot make. Not "blocked": it does not exist.
     * Required, and answered fail-closed (`false` while the caller still has to
     * look the whitelist up) — a missing answer must silence the offer, never
     * wave it through.
     */
    allowedProduct: (fromLineId: string, productId: string) => boolean;
    /**
     * The configuration the customer is looking at on step 3, when there is
     * one. Null in the drawer at steps 1-2, where no design is on screen.
     */
    currentConfigCode?: string | null;
  }
): ActiveSuggestion[] {
  if (!config.automationsEnabled) return [];

  const qtyByProduct: Record<string, number> = {};
  for (const l of lines) {
    if (!included(l.productId, config)) continue; // excluded ⇒ never a trigger
    qtyByProduct[l.productId as string] =
      (qtyByProduct[l.productId as string] ?? 0) + l.quantity;
  }
  // ADR 0025: the same two passes computeCartDiscount runs, so the cart and the
  // offer list can never disagree about how much of an offer is left.
  const { pool, maxCovered, remaining } = allocateDeals(lines, config, qtyByProduct);

  const out: ActiveSuggestion[] = [];
  for (const rule of config.rules) {
    if (out.length >= MAX_SUGGESTIONS) break;
    // D1 (ADR 0025) — no longer "the suggested product is already in the cart",
    // which banned the same-product upsell outright and let a full-price purchase
    // of the suggested ceramic switch a live offer off. Now: "the offer has
    // already been taken in full". A budget of 0 also covers the unreached
    // trigger — no pool, no budget — so the old trigger check lives here too.
    if ((remaining[rule.id] ?? 0) <= 0) continue;

    // The line that lends its config. Biggest first, first-seen on a tie — but
    // if the customer is looking at a configuration on step 3 and one of the
    // candidates wears it, that one wins: guessing "the biggest" hands them an
    // Amalfi offer while they are studying Juletre.
    const byQty = lines
      .filter(
        (l) =>
          l.productId &&
          rule.triggerProductIds.includes(l.productId) &&
          included(l.productId, config)
      )
      .sort((a, b) => b.quantity - a.quantity);
    const from =
      (opts.currentConfigCode
        ? byQty.find((l) => l.configCode === opts.currentConfigCode)
        : undefined) ?? byQty[0];
    if (!from) continue;

    // same supplier, or the config code means nothing on the suggested product
    const sup = opts.supplierOf(from.id);
    if (!sup || opts.supplierOfProduct(rule.suggestedProductId) !== sup) continue;

    // D3 — and the donor's design must actually offer the suggested ceramic.
    if (!opts.allowedProduct(from.id, rule.suggestedProductId)) continue;

    // The card quotes the offer at ITS OWN size, so it sits exactly on the floor
    // by construction — `applies` is the only outcome that can price a
    // suggestion, and anything else means there is nothing to show.
    const d = resolveDeal(
      rule.id,
      rule.suggestedProductId,
      rule.suggestedQty,
      { pool, qtyByProduct, maxCovered },
      config
    );
    out.push({ rule, fromLineId: from.id, pct: d.kind === "applies" ? d.pct : 0 });
  }
  return out;
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

  // ADR 0025, the two passes: which units are at full price, then who gets the
  // coverage. Done once for the whole cart so no line can disagree with another.
  const allocation = allocateDeals(lines, config, qtyByProduct);

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
    let pendingDeal: LineDiscount["pendingDeal"];
    if (l.dealRuleId) {
      const { deal, covered } = allocation.byLine[l.id] ?? {
        deal: { kind: "none" } as DealResolution,
        covered: 0,
      };
      if (deal.kind === "applies" && covered > 0) {
        pct = deal.pct;
        source = "deal";
        // The rule's budget, already consumed in cart order by allocateDeals —
        // NOT `min(quantity, suggestedQty)`, which handed every line the whole
        // offer and never consumed the trigger.
        coveredQty = covered;
      } else if (deal.kind === "short") {
        // Below the offer's floor: no deal, and the line simply carries on to
        // the tier branch below like any other — that fallback already exists,
        // nothing is built for it here. The shortfall travels so the customer
        // can be told why the price moved.
        pendingDeal = { missing: deal.missing, pct: deal.pct };
      }
      // Budget spent (`applies` with `covered === 0`): no deal and NO message.
      // Nothing is missing on the customer's side — the offer is simply over —
      // so the line carries on to the tier branch like any other.
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
      tierEligible:
        config.tiersEnabled && included(l.productId, config) && source !== "deal",
      pendingDeal,
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
