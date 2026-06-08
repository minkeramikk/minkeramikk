import "server-only";

/**
 * Server-side Cloudflare Turnstile verification (F05 AC4). The secret never
 * reaches the client. In dev/CI without a configured secret we fall back to
 * Cloudflare's documented test secret (always passes), so the flow is testable
 * without a real key; production sets TURNSTILE_SECRET_KEY.
 */
const TEST_SECRET_ALWAYS_PASSES = "1x0000000000000000000000000000000AA";

export async function verifyTurnstile(token: string): Promise<boolean> {
  if (!token) return false;
  const secret = process.env.TURNSTILE_SECRET_KEY || TEST_SECRET_ALWAYS_PASSES;
  try {
    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ secret, response: token }),
      }
    );
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
