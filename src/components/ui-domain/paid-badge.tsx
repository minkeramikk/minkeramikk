/**
 * Payment badge (DESIGN-SYSTEM §3.3): same soft recipe as OrderStatusBadge —
 * token tinted at 16% on white, darkened text, 38% border. Paid uses the
 * `--status-paid` token; unpaid stays muted, so an unpaid order reads as a
 * neutral fact and not as an error.
 */
export function PaidBadge({ paidAt }: { paidAt: string | null }) {
  const token = paidAt ? "var(--status-paid)" : "var(--muted-foreground)";
  return (
    <span
      data-testid="paid-badge"
      data-paid={paidAt ? "1" : "0"}
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap"
      style={{
        backgroundColor: `color-mix(in oklab, ${token} 16%, white)`,
        color: `color-mix(in oklab, ${token}, black 34%)`,
        border: `1px solid color-mix(in oklab, ${token} 38%, white)`,
      }}
    >
      {paidAt ? "Paid" : "Unpaid"}
    </span>
  );
}
