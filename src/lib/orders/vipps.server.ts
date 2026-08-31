import "server-only";

import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { NO_VIPPS, type VippsSettings } from "./vipps";

/**
 * Read the Vipps payment details from `settings` (R4-TAKK, ADR 0008 pattern —
 * same shape as getThemeTokens). Public-readable row (RLS 0002) → anon client,
 * no per-pageview JWT refresh.
 *
 * NEVER throws: a missing row, a failed read, or a database that has not run
 * migration 0035 yet all degrade to NO_VIPPS, which hides the payment block.
 * That is the same graceful state as "Alessio hasn't filled it in yet", so the
 * thank-you page keeps working through the whole rollout window.
 */
async function loadVippsSettings(): Promise<VippsSettings> {
  try {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from("settings")
      .select("vipps_qr_image, vipps_number, vipps_link")
      .eq("id", 1)
      .maybeSingle();
    if (!data) return NO_VIPPS;
    return {
      qrImage: data.vipps_qr_image?.trim() || null,
      number: data.vipps_number?.trim() || null,
      link: data.vipps_link?.trim() || null,
    };
  } catch {
    return NO_VIPPS;
  }
}

/**
 * `revalidate: 300` is load-bearing, not belt-and-braces: these three fields are
 * configured OUT OF BAND — by hand, in SQL — and there is no back-office action
 * to call `revalidateTag("vipps")` when they change. Tag-only invalidation would
 * mean a running server never notices the shop being switched on, and the
 * payment block would stay hidden until the next deploy with nothing to explain
 * why. Five minutes of staleness on a read this cheap is the right trade. The
 * tag stays for the day an admin page exists.
 */
const cached = unstable_cache(loadVippsSettings, ["vipps-settings"], {
  tags: ["vipps"],
  revalidate: 300,
});

/**
 * The guard is OUTSIDE the cache wrapper because
 * `unstable_cache` itself throws when called outside a request scope — which
 * is exactly what happens on the email path (sent from a route handler's
 * post-response work), and a themed payment block must never break an order
 * that is already persisted.
 */
export async function getVippsSettings(): Promise<VippsSettings> {
  try {
    return await cached();
  } catch {
    return loadVippsSettings();
  }
}
