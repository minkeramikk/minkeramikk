/**
 * Pure content model for the per-supplier production-order PDF (F08).
 *
 * A production order is for the WORKSHOP: it carries the order reference + the
 * exact specification (product, design, each category's chosen option + hex,
 * config code, quantity) — and deliberately NO customer PII (no name, email,
 * phone or message). One document per supplier (split rows, ADR 0007).
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
}

export interface LabPdfDoc {
  orderCode: string;
  /** ISO date (YYYY-MM-DD), locale-independent for deterministic output. */
  date: string;
  supplierName: string;
  items: LabPdfItem[];
  totalPieces: number;
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
  };
}

/** Build the production-order document for ONE supplier, or null if that
 *  supplier has no items in the order. No customer PII is included. */
export function buildLabPdfDoc(
  order: AdminOrder,
  supplierId: string
): LabPdfDoc | null {
  const bySupplier = splitBySupplier(order.items);
  const items = bySupplier.get(supplierId);
  if (!items || items.length === 0) return null;

  return {
    orderCode: order.code,
    date: new Date(order.createdAt).toISOString().slice(0, 10),
    supplierName: items[0].supplierName,
    items: items.map(toItem),
    totalPieces: items.reduce((n, it) => n + it.quantity, 0),
  };
}

/** One document per supplier present in the order. */
export function buildLabPdfDocs(order: AdminOrder): LabPdfDoc[] {
  return [...splitBySupplier(order.items).keys()]
    .map((sid) => buildLabPdfDoc(order, sid))
    .filter((d): d is LabPdfDoc => d !== null);
}
