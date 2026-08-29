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
   *  the cart never fetches. Absent until part ② fills it (Task 13). */
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

const usableTiers = (tiers: DiscountTier[]): DiscountTier[] =>
  tiers
    .filter((t) => t.minQty >= 2 && t.pct > 0)
    .slice()
    .sort((a, b) => b.minQty - a.minQty);

/** The highest tier the quantity reaches; 0 when it reaches none. */
export function tierFor(qty: number, tiers: DiscountTier[]): number {
  for (const t of usableTiers(tiers)) if (qty >= t.minQty) return t.pct;
  return 0;
}

/** The next threshold up — what the cart nudge points at. Null at the top. */
export function nextTier(qty: number, tiers: DiscountTier[]): DiscountTier | null {
  const up = usableTiers(tiers)
    .slice()
    .reverse()
    .find((t) => qty < t.minQty);
  return up ?? null;
}

/** Part ②: the % a rule grants on the line it produced. */
function dealPct(
  ruleId: string,
  qtyByProduct: Record<string, number>,
  config: DiscountConfig
): number {
  if (!config.automationsEnabled) return 0;
  const rule = config.rules.find((r) => r.id === ruleId);
  if (!rule) return 0; // rule deleted/disabled since the line was added
  if (rule.discountMode === "fixed") return rule.discountPct ?? 0;
  if (rule.discountMode === "inherited") {
    if (!config.tiersEnabled) return 0;
    const groupQty = rule.triggerProductIds.reduce(
      (n, pid) => n + (qtyByProduct[pid] ?? 0),
      0
    );
    return tierFor(groupQty, config.tiers);
  }
  return 0;
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
    const full = money(l.unitPriceCents * l.quantity, l.currency);
    fulls.push(full);

    // deal wins over tier (a fixed rule deal survives the tiers being off)
    let pct = 0;
    let source: LineDiscount["source"] = "none";
    if (l.dealRuleId) {
      pct = dealPct(l.dealRuleId, qtyByProduct, config);
      if (pct > 0) source = "deal";
    }
    if (source === "none" && config.tiersEnabled && included(l.productId, config)) {
      pct = tierFor(qtyByProduct[l.productId as string] ?? 0, config.tiers);
      if (pct > 0) source = "tier";
    }

    const saved = pct > 0 ? percentOf(full, pct) : money(0, l.currency);
    perLine[l.id] = {
      pct: source === "none" ? 0 : pct,
      source,
      full,
      saved,
      net: subtract(full, saved),
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
