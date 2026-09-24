/**
 * R5-POLISH-STEP23 T1 — the two-tap delete is one pure decision: first tap
 * ARMS, second tap on the same control FIRES, anything else DISARMS. Tested
 * here because the chip/tile that use it need next-intl and cannot be
 * rendered in this repo's test infra (see basket-host.ts).
 */
import { describe, expect, it } from "vitest";
import { deleteTap, disarm } from "./delete-confirm";

describe("deleteTap", () => {
  it("first tap arms and does not fire", () => {
    expect(deleteTap(false)).toEqual({ armed: true, fire: false });
  });
  it("second tap fires and resets", () => {
    expect(deleteTap(true)).toEqual({ armed: false, fire: true });
  });
  it("disarm never fires", () => {
    expect(disarm()).toEqual({ armed: false, fire: false });
  });
});
