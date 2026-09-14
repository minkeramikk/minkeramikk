import { describe, it, expect, vi, afterEach } from "vitest";
import { resilientRead } from "./resilient-read";

/** The 504 shape, verified against postgrest-js 2.107: no `code` at all. */
const gatewayTimeout = () => ({ message: "Gateway Timeout" });
/** What PostgREST returns when it means it. */
const deterministic = (code: string) => ({ code, message: `deliberate ${code}` });

/** The last-good map is module-level and shared, exactly as it is in the
 *  lambda; every test therefore uses labels of its own. */
let n = 0;
const freshLabel = () => `test-label-${n++}`;

afterEach(() => vi.restoreAllMocks());

const silenceWarn = () => vi.spyOn(console, "warn").mockImplementation(() => {});

describe("resilientRead", () => {
  it("runs once and warns about nothing when the read succeeds", async () => {
    const warn = silenceWarn();
    const run = vi.fn().mockResolvedValue("rows");

    await expect(resilientRead(freshLabel(), run)).resolves.toBe("rows");

    expect(run).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it("retries a gateway timeout once and returns the second attempt", async () => {
    const warn = silenceWarn();
    const run = vi
      .fn()
      .mockRejectedValueOnce(gatewayTimeout())
      .mockResolvedValueOnce("rows");

    await expect(resilientRead("retry-case", run)).resolves.toBe("rows");

    expect(run).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      "[resilient-read] retry",
      "retry-case",
      // the WHOLE error, serialized — that is how we learn its real shape
      '{"message":"Gateway Timeout"}'
    );
  });

  it("does not retry an error that carries a PostgREST code", async () => {
    const warn = silenceWarn();
    const err = deterministic("PGRST116");
    const run = vi.fn().mockRejectedValue(err);

    await expect(resilientRead(freshLabel(), run)).rejects.toBe(err);

    expect(run).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it("serves the last good value when both attempts fail", async () => {
    const warn = silenceWarn();
    const run = vi.fn().mockResolvedValue("good rows");
    await resilientRead("stale-case", run); // deposits the last good value

    run.mockRejectedValue(gatewayTimeout());
    await expect(resilientRead("stale-case", run)).resolves.toBe("good rows");

    expect(warn).toHaveBeenCalledWith("[resilient-read] stale", "stale-case");
  });

  it("rethrows when both attempts fail and there is no last good value", async () => {
    silenceWarn();
    const err = gatewayTimeout();
    const run = vi.fn().mockRejectedValue(err);

    await expect(resilientRead(freshLabel(), run)).rejects.toBe(err);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("keeps 32 entries: the 33rd label evicts the oldest", async () => {
    silenceWarn();
    const labels = Array.from({ length: 33 }, (_, i) => `evict-${i}`);
    for (const label of labels) {
      await resilientRead(label, async () => `value of ${label}`);
    }

    const failing = vi.fn().mockRejectedValue(gatewayTimeout());

    // the oldest write is gone, so there is nothing to fall back to
    await expect(resilientRead("evict-0", failing)).rejects.toMatchObject({
      message: "Gateway Timeout",
    });
    // the second-oldest is still there
    await expect(resilientRead("evict-1", failing)).resolves.toBe("value of evict-1");
    // and so is the newest
    await expect(resilientRead("evict-32", failing)).resolves.toBe("value of evict-32");
  });
});
