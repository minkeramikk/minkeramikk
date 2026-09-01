import { formatEventAt, type TimelineRow } from "@/lib/orders/order-events";

/**
 * R4-ORDERS-PLUS §B — the order's activity log, under the internal notes.
 *
 * A REGISTER, not a feed: no cards, no accordions, nothing to open. One line
 * per event, a coloured dot for the family (arriving status / email / payment /
 * tracking), the time, the sentence. It is read top to bottom, oldest first,
 * because that is the order the story happened in.
 *
 * Presentational: the rows arrive already rendered from `timeline()`, which is
 * where the wording lives and where it is unit-tested. Admin English-only.
 */
export function OrderTimeline({ rows }: { rows: TimelineRow[] }) {
  return (
    <ol data-testid="order-timeline" className="flex flex-col gap-2">
      {rows.map((row) => (
        <li key={row.id} data-testid="timeline-row" className="flex items-start gap-2.5 text-sm">
          <span
            aria-hidden
            className="mt-1.5 size-2 shrink-0 rounded-full"
            // Same recipe as OrderStatusBadge: the family's own token, tinted,
            // never a hardcoded colour (ADR 0008).
            style={{ backgroundColor: `color-mix(in oklab, var(${row.token}) 85%, white)` }}
          />
          <span className="min-w-0">
            <time
              dateTime={row.at}
              className="mr-2 text-xs whitespace-nowrap text-muted-foreground tabular-nums"
            >
              {formatEventAt(row.at)}
            </time>
            {row.text}
          </span>
        </li>
      ))}
    </ol>
  );
}
