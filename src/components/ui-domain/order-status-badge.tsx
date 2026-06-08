import {
  STATUS_LABEL,
  STATUS_TOKEN,
  type OrderStatus,
} from "@/lib/orders/order-status";

/**
 * Soft status badge (DESIGN-SYSTEM §3.3): the status token tinted on white —
 * bg @16%, darkened text, @38% border. Dark text on a tinted fill keeps AA
 * under any theme. No hardcoded colours.
 */
export function OrderStatusBadge({
  status,
  className,
}: {
  status: OrderStatus;
  className?: string;
}) {
  const token = `var(${STATUS_TOKEN[status]})`;
  return (
    <span
      data-testid="status-badge"
      data-status={status}
      className={
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap " +
        (className ?? "")
      }
      style={{
        backgroundColor: `color-mix(in oklab, ${token} 16%, white)`,
        color: `color-mix(in oklab, ${token}, black 34%)`,
        border: `1px solid color-mix(in oklab, ${token} 38%, white)`,
      }}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
