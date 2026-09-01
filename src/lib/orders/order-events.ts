import {
  isOrderStatus,
  STATUS_LABEL,
  STATUS_TOKEN,
} from "./order-status";

/**
 * R4-ORDERS-PLUS §B — the order activity log, as it is READ.
 *
 * PURE: no React, no DB, no `server-only`. The writer lives in
 * `order-events.server.ts`, the drawing in `order-timeline.tsx`; everything
 * that decides what a row SAYS is here, where it has unit tests.
 *
 * The catalogue of kinds is decided in the card and is not open to
 * interpretation. Two things in particular:
 *  - «Order created» is SYNTHETIC — derived from `orders.created_at`, never
 *    written. That is what makes the log cover every pre-log order for free,
 *    with no backfill.
 *  - `payment_registered` carries the outcome of the mail (R4-MAIL-JOURNEY
 *    made that toggle send one); `payment_cleared` sends nothing and stays `{}`.
 *
 * Admin English-only (i18n rule 5): the strings live here, not in next-intl.
 */

export const ORDER_EVENT_KINDS = [
  "status_changed",
  "custom_email_sent",
  "payment_registered",
  "payment_cleared",
  "tracking_set",
] as const;

export type OrderEventKind = (typeof ORDER_EVENT_KINDS)[number];

/**
 * What became of the mail an admin action could have sent. Three values, not
 * two: `skipped` covers "the admin unticked it", "the status does not mail at
 * all" (EMAIL_STATUSES lost `confirmed`), and "there was nobody to mail".
 */
export type EmailOutcome = `sent:${string}` | "skipped" | "failed";

export interface OrderEventRow {
  id: string;
  createdAt: string;
  kind: string;
  meta: Record<string, unknown>;
}

export interface TimelineRow {
  id: string;
  at: string;
  text: string;
  /** CSS variable NAME (e.g. `--status-paid`) for the family dot. */
  token: string;
}

/** Reads the outcome back. Null when there is nothing to say — a malformed or
 *  absent value must degrade to "no suffix", never to a wrong claim. */
export function parseEmailOutcome(
  v: unknown
): { kind: "sent"; to: string } | { kind: "skipped" } | { kind: "failed" } | null {
  if (typeof v !== "string") return null;
  if (v === "skipped") return { kind: "skipped" };
  if (v === "failed") return { kind: "failed" };
  const to = v.startsWith("sent:") ? v.slice(5) : "";
  return to ? { kind: "sent", to } : null;
}

/** «28 Aug 2026, 14:02». Deliberately NOT the detail page's `fmtDateTime`,
 *  which is `month: "2-digit"` and serves four other places. Never raw ISO. */
export function formatEventAt(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** The «· email sent to …» tail, or "" when the meta says nothing. */
function emailSuffix(meta: Record<string, unknown>): string {
  const outcome = parseEmailOutcome(meta.email);
  if (!outcome) return "";
  if (outcome.kind === "sent") return ` · email sent to ${outcome.to}`;
  if (outcome.kind === "failed") return " · but the email FAILED";
  return " · no email";
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** One renderer per kind. An unknown kind returns null and its row is dropped:
 *  a newer deploy writing a kind this build has never heard of must not break
 *  an older page. */
const RENDER: Record<
  OrderEventKind,
  (meta: Record<string, unknown>) => { text: string; token: string }
> = {
  status_changed: (meta) => {
    const to = isOrderStatus(meta.to) ? meta.to : null;
    const from = isOrderStatus(meta.from) ? meta.from : null;
    const arrow = from && to ? `${STATUS_LABEL[from]} → ${STATUS_LABEL[to]}` : "";
    const label = arrow || (to ? STATUS_LABEL[to] : "");
    return {
      text: `Status: ${label}${emailSuffix(meta)}`,
      token: to ? STATUS_TOKEN[to] : "--muted-foreground",
    };
  },
  custom_email_sent: (meta) => ({
    text: `Email from admin: “${str(meta.subject)}” → ${str(meta.to)}`,
    token: "--primary",
  }),
  payment_registered: (meta) => ({
    text: `Payment registered${emailSuffix(meta)}`,
    token: "--status-paid",
  }),
  payment_cleared: () => ({ text: "Payment undone", token: "--status-paid" }),
  tracking_set: (meta) => {
    const code = str(meta.code);
    return {
      text: code ? `Tracking code set: ${code}` : "Tracking code cleared",
      token: "--muted-foreground",
    };
  },
};

/**
 * The whole story, CHRONOLOGICAL ASCENDING: creation at the top, the last thing
 * that happened at the bottom. The synthetic first row is why an order that
 * predates this feature still has a timeline.
 */
export function timeline(createdAt: string, events: OrderEventRow[]): TimelineRow[] {
  const rows: TimelineRow[] = [
    { id: "created", at: createdAt, text: "Order created", token: STATUS_TOKEN.new },
  ];
  for (const e of [...events].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const render = RENDER[e.kind as OrderEventKind];
    if (!render) continue; // unknown kind: skipped, never guessed at
    const { text, token } = render(e.meta ?? {});
    rows.push({ id: e.id, at: e.createdAt, text, token });
  }
  return rows;
}
