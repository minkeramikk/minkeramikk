import { defineConfig, devices } from "@playwright/test";
import { loadEnvLocal } from "./e2e/helpers";

/**
 * Lean e2e suite (rewritten 2026-06-17). Runs against a PRODUCTION build
 * (`next build` first — see the Makefile, which also bakes the Turnstile test
 * site key by building with an EMPTY NEXT_PUBLIC_TURNSTILE_SITE_KEY so the
 * widget emits the always-pass test token). Requires `.env.local` (live
 * Supabase). The 8 journeys map 1:1 to docs/release/ACCEPTANCE.md.
 *
 * Email policy: the default suite runs with RESEND disabled (no real sends).
 * `make test-email` sets MK_E2E_REAL_EMAIL=1 to send ONE real order email to
 * the dedicated test inbox (E2E_EMAIL_TO).
 */

loadEnvLocal();
const realEmail = process.env.MK_E2E_REAL_EMAIL === "1";

// Journeys that carry mobile assertions (public + admin UI). supplier-pdf is an
// API/route flow and share-set is desktop-only by policy → desktop only.
const MOBILE_JOURNEYS =
  /(configurator|config-code|cart|order|admin-auth|admin-orders)\.spec\.ts$/;
const DESKTOP_JOURNEYS =
  /(configurator|config-code|cart|order|admin-auth|admin-orders|supplier-pdf|share-set)\.spec\.ts$/;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3199",
  },
  webServer: {
    command: "npm run start -- -p 3199",
    url: "http://localhost:3199/no/configurator",
    // Reuse a running server EXCEPT for the real-email run, which needs its own
    // server started with RESEND enabled (a stale no-op server would silently
    // swallow the send).
    reuseExistingServer: !realEmail,
    timeout: 60_000,
    env: {
      ...process.env,
      // Server-side, read at runtime. Off by default → no-op transport → zero
      // real sends. On only for `make test-email`.
      RESEND_API_KEY: realEmail ? process.env.RESEND_API_KEY ?? "" : "",
      ...(realEmail && process.env.E2E_EMAIL_TO
        ? { ORDER_NOTIFY_EMAIL: process.env.E2E_EMAIL_TO }
        : {}),
    },
  },
  projects: [
    {
      name: "desktop",
      testMatch: DESKTOP_JOURNEYS,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      name: "mobile",
      testMatch: MOBILE_JOURNEYS,
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } },
    },
    {
      // Opt-in real-email checks (ordine + PDF fornitore). Never matched by
      // desktop/mobile, so the core suite never sends. Run via `make test-email`.
      name: "email",
      testMatch: /(order-email|supplier-email)\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // Client-evidence screenshots (tooling, not a gate).
      name: "evidence",
      testMatch: /evidence\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
