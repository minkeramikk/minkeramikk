/**
 * F28 — auto-detect parser for the admin "paste a code or a link" input
 * (ADR 0016). Pure module, no DB, no React: SYNTACTIC detection and
 * normalization only — whether a payload still resolves against the catalog
 * is the caller's job (strict at ADD, tolerant at READ).
 *
 * Accepted shapes, in detection order:
 *   1. an app URL carrying `?code=` or `?set=` (copy-link of the
 *      ConfigCodeBar or a CA-3 "Share your set" link) — the primary UX:
 *      compose in the app, copy the link, paste it here;
 *   2. a raw CA-3 set param (`code.slug.qty~…`) — it contains `.`,
 *      a config code never does;
 *   3. a raw config code (`MK-…`, ADR 0011 — prefix optional, the codec
 *      tolerates its absence).
 *
 * Payloads come out CANONICAL (code normalized uppercase, set re-encoded),
 * so the DB UNIQUE on payload actually dedups equivalent inputs.
 */
import { normalizeConfigCode } from "@/lib/configurator/config-code";
import {
  decodeSetParam,
  encodeSetParam,
  type SetEntry,
} from "@/lib/cart/set-code";
import {
  decodeKitParam,
  encodeKitParam,
  type KitEntry,
} from "@/lib/cart/kit-code";

export type FeaturedInput =
  | { ok: true; kind: "design"; payload: string }
  | { ok: true; kind: "set"; payload: string; entries: SetEntry[] }
  | { ok: true; kind: "kit"; payload: string; entries: KitEntry[]; designCode: string }
  | { ok: false; reason: FeaturedInputError };

export type FeaturedInputError =
  | "empty"
  | "url-without-payload" // an URL, but no ?code= / ?set= / ?kit= in it
  | "invalid-set" // set-shaped but with malformed rows (strict at ADD)
  | "invalid-kit" // kit-shaped but with malformed rows (strict at ADD)
  | "invalid-code"; // neither a set, a kit, nor a plausible config code

/** Extract the `?code=` / `?set=` / `?kit=` value from anything URL-shaped. */
function fromUrl(raw: string): { code?: string; set?: string; kit?: string } | null {
  // tolerate absolute, protocol-less and path-relative links: all we need
  // is the query string
  const qIndex = raw.indexOf("?");
  const looksLikeUrl =
    /^[a-z]+:\/\//i.test(raw) || raw.startsWith("/") || raw.includes("/");
  if (qIndex === -1 || !looksLikeUrl) return null;
  const params = new URLSearchParams(raw.slice(qIndex + 1));
  return {
    code: params.get("code") ?? undefined,
    set: params.get("set") ?? undefined,
    kit: params.get("kit") ?? undefined,
  };
}

function parseSet(raw: string): FeaturedInput {
  const { entries, dropped } = decodeSetParam(raw);
  // strict at ADD (ADR 0016): a single malformed row rejects the input —
  // no lame sets in the shop window
  if (entries.length === 0 || dropped > 0) return { ok: false, reason: "invalid-set" };
  return { ok: true, kind: "set", payload: encodeSetParam(
    entries.map((e) => ({
      configCode: e.configCode,
      productSlug: e.productSlug,
      quantity: e.qty,
    }))
  ), entries };
}

function parseKit(raw: string): FeaturedInput {
  const { designCode, entries, dropped } = decodeKitParam(raw);
  // strict at ADD (ADR 0016): a single malformed row rejects the input
  if (entries.length === 0 || dropped > 0) return { ok: false, reason: "invalid-kit" };
  return {
    ok: true,
    kind: "kit",
    payload: encodeKitParam(
      designCode,
      entries.map((e) => ({ productSlug: e.productSlug, quantity: e.qty }))
    ),
    entries,
    designCode,
  };
}

function parseCode(raw: string): FeaturedInput {
  const norm = normalizeConfigCode(raw);
  // plausible code: at least prefix + design segment, only codec charset
  if (!norm || !/^(?:MK-)?[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(norm)) {
    return { ok: false, reason: "invalid-code" };
  }
  return { ok: true, kind: "design", payload: norm };
}

export function parseFeaturedInput(raw: string): FeaturedInput {
  const input = raw.trim();
  if (!input) return { ok: false, reason: "empty" };

  const url = fromUrl(input);
  if (url) {
    // `kit` wins when both are present (more specific landing)
    if (url.kit) return parseKit(decodeURIComponentSafe(url.kit));
    // `set` wins when both are present (more specific landing)
    if (url.set) return parseSet(decodeURIComponentSafe(url.set));
    if (url.code) return parseCode(decodeURIComponentSafe(url.code));
    return { ok: false, reason: "url-without-payload" };
  }

  // raw kit: carries `~` rows but NO `.` in the first token
  // (a set row is `<code>.<slug>.<qty>`; a kit head is just `<D>`)
  const [head] = input.split("~");
  if (!head.includes(".") && input.includes("~")) return parseKit(input);

  // a set param carries `.` between fields; a config code never does
  if (input.includes(".")) return parseSet(input);

  return parseCode(input);
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
