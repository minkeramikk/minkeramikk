import { describe, it, expect } from "vitest";
import { JOURNEY_STEPS, currentStep } from "./order-journey";

const PAID = "2026-09-01T09:00:00Z";

describe("JOURNEY_STEPS", () => {
  it("is the decided order: received → paid → production → shipped", () => {
    expect(JOURNEY_STEPS).toEqual(["received", "paid", "production", "shipped"]);
  });
});

describe("currentStep — the LAST thing that happened, never the next", () => {
  it("a new order sits on 'received', paid or not yet", () => {
    expect(currentStep("new")).toBe(0);
    expect(currentStep("new", null)).toBe(0);
  });

  it("any paid_at moves it to 'paid', whatever the status says", () => {
    expect(currentStep("new", PAID)).toBe(1);
    expect(currentStep("confirmed", PAID)).toBe(1);
  });

  it("confirmed without a payment is still only 'received'", () => {
    expect(currentStep("confirmed")).toBe(0);
    expect(currentStep("confirmed", null)).toBe(0);
  });

  it("in_production is 'production', with or without paid_at", () => {
    expect(currentStep("in_production")).toBe(2);
    expect(currentStep("in_production", PAID)).toBe(2);
  });

  it("shipped and delivered both sit on the last step", () => {
    expect(currentStep("shipped")).toBe(3);
    expect(currentStep("shipped", PAID)).toBe(3);
    expect(currentStep("delivered")).toBe(3);
    expect(currentStep("delivered", PAID)).toBe(3);
  });

  it("the dormant 'contacted' behaves like 'new'", () => {
    expect(currentStep("contacted")).toBe(0);
    expect(currentStep("contacted", PAID)).toBe(1);
  });

  it("cancelled is OUT of the pipeline: no index, even when it was paid", () => {
    expect(currentStep("cancelled")).toBeNull();
    expect(currentStep("cancelled", PAID)).toBeNull();
  });
});
