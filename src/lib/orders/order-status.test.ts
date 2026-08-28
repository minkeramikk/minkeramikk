import { describe, it, expect } from "vitest";
import {
  DORMANT_STATUSES,
  ORDER_STATUSES,
  OPEN_STATUSES,
  STATUS_LABEL,
  STATUS_PIPELINE,
  STATUS_TOKEN,
  isOpenStatus,
  isOrderStatus,
} from "./order-status";

describe("order lifecycle v2 (ADR 0021)", () => {
  it("exposes the six visible statuses, contacted excluded", () => {
    expect([...ORDER_STATUSES]).toEqual([
      "new",
      "confirmed",
      "in_production",
      "shipped",
      "delivered",
      "cancelled",
    ]);
    expect(ORDER_STATUSES).not.toContain("contacted");
  });

  it("keeps contacted dormant: parsed from the DB, never listed", () => {
    expect([...DORMANT_STATUSES]).toEqual(["contacted"]);
    // a legacy row must NOT be coerced to another status
    expect(isOrderStatus("contacted")).toBe(true);
    expect(isOrderStatus("shipped")).toBe(true);
    expect(isOrderStatus("posted")).toBe(false);
    expect(isOrderStatus(3)).toBe(false);
  });

  it("draws the happy-path pipeline with shipped and without contacted", () => {
    expect([...STATUS_PIPELINE]).toEqual([
      "new",
      "confirmed",
      "in_production",
      "shipped",
      "delivered",
    ]);
  });

  it("counts shipped as still open, delivered and cancelled as closed", () => {
    expect(isOpenStatus("shipped")).toBe(true);
    expect(isOpenStatus("in_production")).toBe(true);
    expect(isOpenStatus("delivered")).toBe(false);
    expect(isOpenStatus("cancelled")).toBe(false);
    expect(OPEN_STATUSES).toContain("contacted"); // legacy rows stay counted
  });

  it("labels and colour tokens cover every value, dormant included", () => {
    for (const s of [...ORDER_STATUSES, ...DORMANT_STATUSES]) {
      expect(STATUS_LABEL[s]).toBeTruthy();
      expect(STATUS_TOKEN[s]).toMatch(/^--/);
    }
    expect(STATUS_LABEL.shipped).toBe("Shipped");
    expect(STATUS_TOKEN.shipped).toBe("--status-shipped");
  });
});
