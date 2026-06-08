/**
 * Seed the single back-office admin (F06). Reproducible + idempotent: re-running
 * converges (creates the user once, then resets the password to match the env).
 *
 * There is NO public signup — the admin is provisioned ONLY by this script,
 * using the Supabase service-role key (server-only). Credentials come from the
 * environment (ADMIN_EMAIL / ADMIN_PASSWORD in .env.local), never hardcoded;
 * the real client credentials are set at handover.
 *
 * Run: npm run seed:admin
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(__dirname, "../.env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {
    /* rely on process env */
  }
}
loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!email || !password) {
  console.error(
    "Missing ADMIN_EMAIL / ADMIN_PASSWORD (set them in .env.local — the password is yours to choose)"
  );
  process.exit(1);
}

const db = createClient(url, serviceKey, { auth: { persistSession: false } });

async function findByEmail(target: string) {
  // paginate the auth users (single admin project → one page is plenty)
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find(
      (u) => u.email?.toLowerCase() === target.toLowerCase()
    );
    if (found) return found;
    if (data.users.length < 200) break; // last page
  }
  return null;
}

async function main() {
  const existing = await findByEmail(email!);
  if (existing) {
    // idempotent: keep the account, align the password + confirmed state to env
    const { error } = await db.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
    });
    if (error) throw error;
    console.log(`admin: updated existing user ${email} (id ${existing.id})`);
  } else {
    const { data, error } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    console.log(`admin: created user ${email} (id ${data.user?.id})`);
  }
  console.log("done. (no public signup — this is the only way to provision the admin)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
