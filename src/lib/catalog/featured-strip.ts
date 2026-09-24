/**
 * R5-TEXT-IDENTITY (featured-fix) — strip a featured-config payload down to
 * colours-only, given a design resolver.
 *
 * Why this exists as its own pure module: `featured.ts` needs `"server-only"`
 * (live catalog reads via Supabase) and can't be imported by a test at all —
 * that package throws unconditionally outside a Next.js server bundle. The
 * part actually worth unit-testing — "given a resolver, strip this code" —
 * is pulled out here instead, with no DB and no React, exercised against a
 * synthetic resolver exactly like `config-code.test.ts` and
 * `set-code.test.ts` already do for the codec it calls.
 *
 * Same technique as task 2/3, not string surgery: `decodeConfigCode` needs
 * the design to know how many colour segments it owns before it can even
 * find the inscription slot, and `encodeConfigCode` without `extras` never
 * emits one. Every function here degrades to the input UNCHANGED on any
 * decode failure (unknown design, malformed shape) — this module never
 * REJECTS a payload, that's `validateFeaturedPayload`'s own catalog check;
 * this one only ever strips a payload that already resolves.
 *
 * The leak this closes: the admin "paste a code or link" curator
 * (ADR 0016) accepts a raw config code, and a customer's own cart drawer
 * offers "Copy code" — so an admin curating the shop window can paste a
 * customer's exact code, inscription included, straight onto the public
 * home strip. Stripping here, before `validateFeaturedPayload` hands a
 * payload back to be previewed or stored, closes that path.
 */
import {
  decodeConfigCode,
  encodeConfigCode,
  type CodecDesign,
} from "@/lib/configurator/config-code";
import { decodeSetParam, encodeSetParam } from "@/lib/cart/set-code";

/** The colours-only version of one config code. */
export function stripFeaturedCode(
  code: string,
  findByCode: (code: string) => CodecDesign | null
): string {
  let resolved: CodecDesign | null = null;
  try {
    const { selections } = decodeConfigCode(code, (c) => (resolved = findByCode(c)));
    return resolved ? encodeConfigCode(resolved, selections) : code;
  } catch {
    return code; // ConfigCodeError (empty/unknown/malformed) — leave as-is
  }
}

/** The colours-only version of a whole `set=`-shaped payload: every row's
 *  code stripped, rows/qty/slugs otherwise unchanged. */
export function stripFeaturedSet(
  payload: string,
  findByCode: (code: string) => CodecDesign | null
): string {
  const { entries } = decodeSetParam(payload);
  return encodeSetParam(
    entries.map((e) => ({
      configCode: stripFeaturedCode(e.configCode, findByCode),
      productSlug: e.productSlug,
      quantity: e.qty,
    }))
  );
}
