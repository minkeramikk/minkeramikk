import { AdminShell } from "@/components/shell/admin-shell";

export default function AdminOrdersPage() {
  return (
    <AdminShell active="/admin" title="Orders">
      {/* Orders table (flow F07) arrives with the database. */}
      <p className="text-sm text-muted-foreground">
        No orders yet — the orders table lands with flow F07.
      </p>
    </AdminShell>
  );
}
