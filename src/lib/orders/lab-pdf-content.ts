/**
 * Pure content model for the per-supplier production-order PDF (F08).
 *
 * A production order is for the WORKSHOP, which ships the finished pieces
 * DIRECTLY to the customer — so it carries the order reference, the exact
 * specification (product, design, each category's chosen option + hex, config
 * code, quantity) AND the customer's ship-to block (name, address, phone).
 * Email and internal notes/message stay out. One document per supplier
 * (split rows, ADR 0007).
 *
 * Pure + serializable so the textual content is snapshot-testable without
 * rendering a PDF or hitting a DB.
 */
import { splitBySupplier } from "./build";
import type { AdminOrder, AdminOrderItem } from "./admin-orders";

export interface LabPdfSelection {
  label: string;
  option: string;
  hex: string | null;
}

export interface LabPdfItem {
  productName: string;
  designName: string;
  configCode: string | null;
  quantity: number;
  selections: LabPdfSelection[];
  /** R2-2b: present ⇒ render the "Customer note" line ("" = studio default). */
  customNote?: string;
  /** F38: the customer's inscription — a production instruction, shown prominently. */
  customText?: string;
}

/** Customer ship-to block — the workshop ships the finished pieces here. */
export interface LabPdfShipTo {
  name: string;
  email: string | null;
  address: string | null;
  zipcode: string | null;
  country: string | null;
  phone: string | null;
}

export interface LabPdfDoc {
  orderCode: string;
  /** ISO date (YYYY-MM-DD), locale-independent for deterministic output. */
  date: string;
  supplierName: string;
  shipTo: LabPdfShipTo;
  items: LabPdfItem[];
  totalPieces: number;
  /** Σ(quantity × unit weight) in grams over lines that HAVE a weight; null when
   *  no line in this doc has a weight on file. */
  totalWeightGrams: number | null;
  /** How many lines were skipped because they had no unit weight (partial total). */
  weightMissingLines: number;
}

function toItem(it: AdminOrderItem): LabPdfItem {
  return {
    productName: it.productName,
    designName: it.configSnapshot?.designName ?? "—",
    configCode: it.configCode,
    quantity: it.quantity,
    selections: (it.configSnapshot?.selections ?? []).map((s) => ({
      label: s.label,
      option: s.option,
      hex: s.hex,
    })),
    customNote: it.configSnapshot?.customNote,
    customText: it.configSnapshot?.customText || undefined,
  };
}

/** Build the production-order document for ONE supplier, or null if that
 *  supplier has no items in the order. Includes the customer ship-to block
 *  (the workshop ships to the customer); email/message are intentionally left out. */
export function buildLabPdfDoc(
  order: AdminOrder,
  supplierId: string
): LabPdfDoc | null {
  const bySupplier = splitBySupplier(order.items);
  const items = bySupplier.get(supplierId);
  if (!items || items.length === 0) return null;

  // Total shipping weight: Σ(quantity × unit weight) over lines that have a
  // weight on file. Lines without one are skipped and counted (partial total).
  const withWeight = items.filter((it) => it.productWeightGrams != null);
  const totalWeightGrams = withWeight.length
    ? withWeight.reduce((g, it) => g + it.quantity * (it.productWeightGrams ?? 0), 0)
    : null;

  return {
    orderCode: order.code,
    date: new Date(order.createdAt).toISOString().slice(0, 10),
    supplierName: items[0].supplierName,
    shipTo: {
      name: order.customerName,
      email: order.email,
      address: order.address,
      zipcode: order.zipcode,
      country: order.country,
      phone: order.phone,
    },
    items: items.map(toItem),
    totalPieces: items.reduce((n, it) => n + it.quantity, 0),
    totalWeightGrams,
    weightMissingLines: items.length - withWeight.length,
  };
}

/** One document per supplier present in the order. */
export function buildLabPdfDocs(order: AdminOrder): LabPdfDoc[] {
  return [...splitBySupplier(order.items).keys()]
    .map((sid) => buildLabPdfDoc(order, sid))
    .filter((d): d is LabPdfDoc => d !== null);
}
