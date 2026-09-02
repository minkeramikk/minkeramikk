import { describe, it, expect } from "vitest";
import { timeline, parseEmailOutcome, formatEventAt } from "./order-events";

const CREATED = "2026-08-28T12:02:00.000Z";
const ev = (kind: string, meta: Record<string, unknown>, at = "2026-08-28T13:00:00.000Z") => ({
  id: `${kind}-${at}`,
  createdAt: at,
  kind,
  meta,
});

describe("timeline — the card's event catalogue, rendered", () => {
  it("«Order created» is SYNTHETIC: it is there with not one event written", () => {
    const rows = timeline(CREATED, []);
    expect(rows).toHaveLength(1);
    expect(rows[0].text).toBe("Order created");
    expect(rows[0].token).toBe("--status-new");
    expect(rows[0].at).toBe(CREATED);
  });

  it("CHRONOLOGICAL ASCENDING: creation first, the last event last", () => {
    const rows = timeline(CREATED, [
      ev("payment_cleared", {}, "2026-08-30T09:00:00.000Z"),
      ev("tracking_set", { code: "NO1" }, "2026-08-29T09:00:00.000Z"),
    ]);
    expect(rows.map((r) => r.text)).toEqual([
      "Order created",
      "Tracking code set: NO1",
      "Payment undone",
    ]);
  });

  it("a status change with a delivered mail names the recipient, and takes the ARRIVING status's token", () => {
    const [, row] = timeline(CREATED, [
      ev("status_changed", {
        from: "confirmed",
        to: "in_production",
        email: "sent:kari@example.no",
      }),
    ]);
    expect(row.text).toBe("Status: Confirmed → In production · email sent to kari@example.no");
    expect(row.token).toBe("--status-production");
  });

  it("a status that no longer mails says so — that is how the MAIL-JOURNEY change becomes visible", () => {
    const [, row] = timeline(CREATED, [
      ev("status_changed", { from: "new", to: "confirmed", email: "skipped" }),
    ]);
    expect(row.text).toBe("Status: New → Confirmed · no email");
  });

  it("a FAILED mail shows: the log is also how you find out", () => {
    const [, row] = timeline(CREATED, [
      ev("status_changed", { from: "new", to: "shipped", email: "failed" }),
    ]);
    expect(row.text).toBe("Status: New → Shipped · but the email FAILED");
  });

  it("payment_registered carries the mail's outcome, payment_cleared carries nothing", () => {
    const rows = timeline(CREATED, [
      ev("payment_registered", { email: "sent:kari@example.no" }, "2026-08-29T09:00:00.000Z"),
      ev("payment_cleared", {}, "2026-08-30T09:00:00.000Z"),
    ]);
    expect(rows[1].text).toBe("Payment registered · email sent to kari@example.no");
    expect(rows[1].token).toBe("--status-paid");
    expect(rows[2].text).toBe("Payment undone");
    expect(rows[2].token).toBe("--status-paid");
  });

  it("the free-text message quotes its subject and its recipient", () => {
    const [, row] = timeline(CREATED, [
      ev("custom_email_sent", { subject: "Om bestillingen MK-1042", to: "kari@example.no" }),
    ]);
    expect(row.text).toBe("Email from admin: “Om bestillingen MK-1042” → kari@example.no");
    expect(row.token).toBe("--primary");
  });

  it("an empty tracking code is a CLEARING, not an empty code on screen", () => {
    const rows = timeline(CREATED, [ev("tracking_set", { code: "" })]);
    expect(rows[1].text).toBe("Tracking code cleared");
    expect(rows[1].token).toBe("--muted-foreground");
  });

  it("an unknown kind is SKIPPED: a newer deploy must not break an older page", () => {
    expect(timeline(CREATED, [ev("something_new", {})])).toHaveLength(1);
  });

  it("malformed meta degrades to what is still true, never to a wrong claim", () => {
    const [, row] = timeline(CREATED, [ev("status_changed", { from: 42, to: "shipped" })]);
    expect(row.text).toBe("Status: Shipped"); // no arrow, and no email claim
  });
});

describe("parseEmailOutcome", () => {
  it("knows the three values and nothing else", () => {
    expect(parseEmailOutcome("sent:a@b.no")).toEqual({ kind: "sent", to: "a@b.no" });
    expect(parseEmailOutcome("skipped")).toEqual({ kind: "skipped" });
    expect(parseEmailOutcome("failed")).toEqual({ kind: "failed" });
    expect(parseEmailOutcome(undefined)).toBeNull();
    expect(parseEmailOutcome("sent:")).toBeNull();
    expect(parseEmailOutcome(42)).toBeNull();
  });
});

describe("formatEventAt", () => {
  it("is readable, never raw ISO", () => {
    // en-GB's short month is 3 or 4 letters ("Aug", but "Sept"), so the shape
    // is asserted loosely enough to survive every month of the year.
    expect(formatEventAt("2026-08-28T12:02:00.000Z")).toMatch(
      /^\d{2} \w{3,4} \d{4}, \d{2}:\d{2}$/
    );
    expect(formatEventAt("2026-09-01T23:56:00.000Z")).toMatch(
      /^\d{2} \w{3,4} \d{4}, \d{2}:\d{2}$/
    );
  });

  // The order page is a server component and Vercel runs in UTC. Unpinned, the
  // whole register would read two hours early for the one person who reads it.
  // These two assertions are exact BECAUSE the zone is pinned: they hold on any
  // machine, and they fail the moment someone drops the option.
  it("is Oslo time in summer (CEST, +2) — the card's own example", () => {
    expect(formatEventAt("2026-08-28T12:02:00.000Z")).toBe("28 Aug 2026, 14:02");
  });

  it("is Oslo time in winter too (CET, +1) — a fixed offset would be wrong here", () => {
    expect(formatEventAt("2026-01-15T12:00:00.000Z")).toBe("15 Jan 2026, 13:00");
  });
});
