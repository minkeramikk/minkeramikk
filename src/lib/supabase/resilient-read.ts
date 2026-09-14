import "server-only";

/**
 * One retry, and as a last resort the last good value, for the PUBLIC CATALOG
 * reads.
 *
 * Why this exists (monitor report 2026-09-14, §7): the Vercel functions talk to
 * Supabase from `iad1`, the database is in Frankfurt, and after a few minutes of
 * silence PostgREST reaps the threads of idle connections ("Warp server error:
 * Thread killed by timeout manager", ~160 lines in 24h). The first request to
 * arrive afterwards has to open a new upstream connection, and on this instance
 * that sometimes takes more than five seconds — the gateway then closes with a
 * 504 and the configurator shows its error page to a real customer.
 *
 * The fix is in the measurement itself. A single trivial `settings` query after
 * twenty minutes of silence: 504 at 5617 ms. The SAME query six seconds later:
 * 200 at 908 ms. Six seconds after that: 542 ms. The second attempt works — so
 * make it.
 *
 * `@supabase/postgrest-js` has a retry of its own, but it only covers status
 * 520 and 503 (`RETRYABLE_STATUS_CODES`) plus network errors. 504 is not in that
 * list, which is exactly the gap this helper fills.
 *
 * SCOPE — read before reusing this. It belongs on public catalog READS only.
 * Never on writes, never on orders, never on admin paths that show operational
 * data: an order must never be rendered stale. `/admin/orders/[id]` gets the
 * retry (through the catalog loaders it goes through) and nothing else.
 */

/** Between the two attempts. Long enough to be on the far side of the reap,
 *  short enough that a human waiting on a render does not notice it. */
const RETRY_DELAY_MS = 400;

/** Cap on the last-good map. There is a cap because `label` carries the slug,
 *  and slugs grow. */
const LAST_GOOD_MAX = 32;

/**
 * Last good value per label.
 *
 * DECLARED LIMIT, not a hidden one: this map lives in the lambda instance. On a
 * freshly started lambda it is empty, and there the fallback simply is not
 * there. It covers the frequent case — warm instance, cold database — not every
 * case. Do not read it as a guarantee.
 *
 * It is ALSO NOT A CACHE. It never extends the life of a value invalidated by
 * `revalidateTag`: nothing reads it on the happy path, it is consulted only
 * after both attempts have failed.
 */
const lastGood = new Map<string, unknown>();

/**
 * A deterministic PostgREST/Postgres failure carries a `code`: `PGRST*` for the
 * ones PostgREST produces itself, `42*` for the privilege and undefined-object
 * class (RLS denial, column that does not exist), `23*` for integrity
 * violations. Retrying those only doubles the damage.
 */
const DETERMINISTIC_CODE = /^(PGRST|42|23)/;

/**
 * The predicate is DELIBERATELY CONSERVATIVE — retry everything EXCEPT an error
 * that names itself deterministic. This is a choice, not an oversight, and the
 * reason is that the failure we are chasing does not identify itself.
 *
 * Verified against `postgrest-js` 2.107: on a non-2xx response the error is
 * `JSON.parse(body)`, and when the body does not parse it is the bare
 * `{ message: body }` (PostgrestBuilder.ts:521 and :536). Both branches of a
 * gateway 504 therefore produce an object with NO `code` at all — the observed
 * production error is literally `{"message":"Gateway Timeout"}`. A transport
 * failure comes through with `code: ''` (:428). Neither matches the pattern, so
 * both are retried, while `PGRST116`, `42501`, `23505` and friends are not.
 *
 * Widening this predicate to guesswork would be worse than the bug it closes: a
 * retry that fires when it must not doubles a deterministic failure. If the
 * shape ever turns out to be different, narrow it here and say why — do not
 * open it up.
 */
function isRetryable(err: unknown): boolean {
  const code = (err as { code?: unknown } | null | undefined)?.code;
  return typeof code !== "string" || !DETERMINISTIC_CODE.test(code);
}

/** The whole error object, not just its message: this log line is how we find
 *  out, in preview and in production, what a 504 really looks like. */
function describe(err: unknown): string {
  try {
    if (err instanceof Error) {
      // An Error's own fields are non-enumerable; JSON.stringify renders "{}".
      return JSON.stringify({ ...err, name: err.name, message: err.message }) ?? String(err);
    }
    return JSON.stringify(err) ?? String(err);
  } catch {
    return String(err);
  }
}

function remember(label: string, value: unknown): void {
  lastGood.delete(label); // re-insert, so the freshest entry sorts last
  lastGood.set(label, value);
  if (lastGood.size > LAST_GOOD_MAX) {
    // Map iterates in insertion order: the first key is the oldest write.
    lastGood.delete(lastGood.keys().next().value as string);
  }
}

/**
 * Run a catalog read; on a retryable failure wait 400 ms and run it ONCE more.
 *
 * Belongs INSIDE the `unstable_cache` loader, never around it: inside, the
 * result of the second attempt is what gets cached, so later renders pay
 * nothing. Outside, it would retry cache hits too.
 *
 * Holds no dependency on the request scope — `unstable_cache` throws when
 * called outside one (R4-MAIL-JOURNEY §E trap 1), and the existing `*Safe`
 * fallbacks must keep working unchanged.
 */
export async function resilientRead<T>(label: string, run: () => Promise<T>): Promise<T> {
  try {
    const value = await run();
    remember(label, value);
    return value;
  } catch (first) {
    if (!isRetryable(first)) throw first;
    console.warn("[resilient-read] retry", label, describe(first));

    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));

    try {
      const value = await run();
      remember(label, value);
      return value;
    } catch (second) {
      if (lastGood.has(label)) {
        console.warn("[resilient-read] stale", label);
        return lastGood.get(label) as T;
      }
      throw second;
    }
  }
}
