import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { defaultTransport } from "@/lib/orders/email";

// Supabase Free pauses a project after ~7 days without database activity. A
// Vercel Cron (see vercel.json) calls this route daily; a trivial anon read
// (RLS-guarded) counts as real DB activity and resets the pause timer.
//
// The URL is public, so the route is gated by CRON_SECRET: Vercel sends it as
// an `Authorization: Bearer <secret>` header on cron invocations. Any other
// caller gets 401 and never reaches the database. If CRON_SECRET is unset (dev,
// preview), the route stays locked — keep-alive only matters in production.
export const dynamic = "force-dynamic";

// Free-plan caps and the alert threshold. When a metric crosses ALERT_AT we
// email ORDER_NOTIFY_EMAIL so there's time to archive/upgrade before the cap.
const DB_LIMIT_BYTES = 500 * 1024 * 1024; // Free: 500 MB database
const STORAGE_LIMIT_BYTES = 1024 * 1024 * 1024; // Free: 1 GB storage
const ALERT_AT = 0.8;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorized =
    !!secret && request.headers.get("authorization") === `Bearer ${secret}`;
  if (!authorized) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  // Keep-alive: least-privilege anon read (head count, no rows) on a public
  // table. This alone is enough to register activity and reset the pause timer.
  const supabase = await createClient();
  const { error } = await supabase
    .from("designs")
    .select("*", { count: "exact", head: true });
  if (error) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  // Usage health-check (best-effort): never fail the keep-alive over metrics.
  const usage = await checkUsage();

  return NextResponse.json({ ok: true, usage });
}

type Usage = {
  db: { bytes: number; limitBytes: number; pct: number };
  storage: { bytes: number; limitBytes: number; pct: number };
};

async function checkUsage(): Promise<Usage | null> {
  try {
    const admin = createServiceRoleClient();
    const [dbRes, storageRes] = await Promise.all([
      admin.rpc("db_size_bytes"),
      admin.rpc("storage_size_bytes"),
    ]);

    const dbBytes = Number(dbRes.data ?? 0);
    const storageBytes = Number(storageRes.data ?? 0);
    const dbPct = dbBytes / DB_LIMIT_BYTES;
    const storagePct = storageBytes / STORAGE_LIMIT_BYTES;

    console.log(
      `[keepalive:usage] db=${mb(dbBytes)} (${pct(dbPct)} of 500 MB) ` +
        `storage=${mb(storageBytes)} (${pct(storagePct)} of 1 GB)`
    );

    const breaches: string[] = [];
    if (dbPct >= ALERT_AT)
      breaches.push(`Database: ${mb(dbBytes)} of 500 MB (${pct(dbPct)})`);
    if (storagePct >= ALERT_AT)
      breaches.push(`Storage: ${mb(storageBytes)} of 1 GB (${pct(storagePct)})`);

    if (breaches.length > 0) {
      const to = process.env.ORDER_NOTIFY_EMAIL || "tech@minkeramikk.no";
      await defaultTransport().send({
        to,
        subject: "[minkeramikk] Supabase Free usage at 80% or more",
        text:
          `Supabase Free-plan usage is approaching the limit:\n\n` +
          `${breaches.join("\n")}\n\n` +
          `Archive data/assets or upgrade to Pro before the cap is hit.`,
      });
    }

    return {
      db: {
        bytes: dbBytes,
        limitBytes: DB_LIMIT_BYTES,
        pct: Math.round(dbPct * 100),
      },
      storage: {
        bytes: storageBytes,
        limitBytes: STORAGE_LIMIT_BYTES,
        pct: Math.round(storagePct * 100),
      },
    };
  } catch (err) {
    // A metrics failure (missing functions, API hiccup) must not break the
    // keep-alive — log and move on.
    console.error("[keepalive:usage] check failed", err);
    return null;
  }
}

function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function pct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}
