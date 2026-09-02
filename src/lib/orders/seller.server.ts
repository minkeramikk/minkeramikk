import "server-only";

import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { NO_SELLER, type SellerIdentity } from "./seller";

/**
 * Read the seller identity from `settings` (R4-PDF-CLIENTE, migration 0038).
 * Same shape, same reasoning and same failure policy as `getVippsSettings` —
 * deliberately not a third pattern.
 *
 * NEVER throws: a missing row, a failed read, or a database that has not run
 * 0038 yet all degrade to NO_SELLER, which prints the footer exactly as it is
 * today. That is the same graceful state as "Alessio hasn't given us the
 * details yet", so the summary keeps rendering through the whole rollout.
 */
async function loadSellerIdentity(): Promise<SellerIdentity> {
  try {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from("settings")
      .select(
        "seller_name, seller_address, seller_org_number, seller_vat_registered, seller_email, seller_phone"
      )
      .eq("id", 1)
      .maybeSingle();
    if (!data) return NO_SELLER;
    return {
      name: data.seller_name?.trim() || null,
      address: data.seller_address?.trim() || null,
      orgNumber: data.seller_org_number?.trim() || null,
      // Anything but an explicit TRUE is "not registered": the illegal state is
      // printing the VAT line when we should not, so the ambiguous read (null,
      // column missing) has to fall on the silent side.
      vatRegistered: data.seller_vat_registered === true,
      email: data.seller_email?.trim() || null,
      phone: data.seller_phone?.trim() || null,
    };
  } catch {
    return NO_SELLER;
  }
}

/** `revalidate: 300` for the same reason as the Vipps settings: these columns
 *  are configured OUT OF BAND, in SQL, with nothing to call `revalidateTag`. */
const cached = unstable_cache(loadSellerIdentity, ["seller-identity"], {
  tags: ["seller"],
  revalidate: 300,
});

/**
 * The guard is OUTSIDE the cache wrapper because `unstable_cache` itself throws
 * when called outside a request scope — which is exactly where the summary is
 * rendered (the deferred `after()` work of order creation), and a footer must
 * never cost an order its PDF.
 */
export async function getSellerIdentity(): Promise<SellerIdentity> {
  try {
    return await cached();
  } catch {
    return loadSellerIdentity();
  }
}
