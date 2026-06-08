import { describe, it, expect } from "vitest";
import { adminGuardRedirect } from "./guard";

describe("adminGuardRedirect", () => {
  it("sends anon away from protected admin pages", () => {
    expect(adminGuardRedirect("/admin", false)).toBe("/admin/login");
    expect(adminGuardRedirect("/admin/orders", false)).toBe("/admin/login");
    expect(adminGuardRedirect("/admin/products", false)).toBe("/admin/login");
  });

  it("lets anon reach the login page", () => {
    expect(adminGuardRedirect("/admin/login", false)).toBeNull();
  });

  it("sends an authenticated admin off the login page to the dashboard", () => {
    expect(adminGuardRedirect("/admin/login", true)).toBe("/admin");
  });

  it("lets an authenticated admin through protected pages", () => {
    expect(adminGuardRedirect("/admin", true)).toBeNull();
    expect(adminGuardRedirect("/admin/orders", true)).toBeNull();
  });
});
