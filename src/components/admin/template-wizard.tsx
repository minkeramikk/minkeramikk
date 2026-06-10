"use client";

import { useActionState, useState } from "react";
import { createDesignFromTemplate } from "@/app/admin/designs/actions";
import { TEMPLATE_META, type TemplateKey } from "@/lib/catalog/design-templates";

interface Supplier {
  id: string;
  name: string;
}

const TEMPLATE_KEYS: TemplateKey[] = ["empty", "colors-only", "colors-and-logos"];

/**
 * F22 — New design template wizard.
 *
 * Three tiles (Vuoto / Solo colori / Colori + loghi) + supplier picker + name
 * input. On submit calls createDesignFromTemplate (server action) which
 * creates the design + seeds categories and redirects to the detail page.
 */
export function TemplateWizard({ suppliers }: { suppliers: Supplier[] }) {
  const [state, create, creating] = useActionState(createDesignFromTemplate, {
    error: null,
  });
  const [selected, setSelected] = useState<TemplateKey>("empty");

  return (
    <form action={create} className="max-w-xl" data-testid="template-wizard">
      {/* ── template choice ─────────────────────────────────────────────── */}
      <fieldset className="mb-6">
        <legend className="mb-2 text-sm font-semibold">Starting template</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {TEMPLATE_KEYS.map((key) => {
            const meta = TEMPLATE_META[key];
            const isSelected = selected === key;
            return (
              <label
                key={key}
                data-testid={`template-tile-${key}`}
                className={[
                  "cursor-pointer rounded-lg border p-3 transition-colors",
                  isSelected
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50",
                ].join(" ")}
              >
                <input
                  type="radio"
                  name="template"
                  value={key}
                  checked={isSelected}
                  onChange={() => setSelected(key)}
                  className="sr-only"
                />
                <p className="text-sm font-semibold">{meta.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{meta.description}</p>
              </label>
            );
          })}
        </div>
        <p
          data-testid="wizard-layer-hint"
          className="mt-2 text-xs text-muted-foreground"
        >
          Templates pre-fill colours &amp; logos, but the colour{" "}
          <em>patterns</em> are unique to your design — after creating, open{" "}
          <em>Edit</em> on each option and upload its compositing layer to see
          the live preview.
        </p>
      </fieldset>

      {/* ── supplier ───────────────────────────────────────────────────── */}
      <div className="mb-4">
        <label htmlFor="wiz-supplier" className="mb-1 block text-sm font-medium">
          Supplier <span aria-hidden className="text-destructive">*</span>
        </label>
        {suppliers.length === 0 ? (
          <p className="text-sm text-destructive">
            No active suppliers — create one first.
          </p>
        ) : (
          <select
            id="wiz-supplier"
            name="supplierId"
            required
            defaultValue=""
            data-testid="wizard-supplier"
            className="h-9 w-full rounded-sm border border-input bg-card px-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
          >
            <option value="" disabled>
              Pick a supplier…
            </option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* ── name ───────────────────────────────────────────────────────── */}
      <div className="mb-6">
        <label htmlFor="wiz-name" className="mb-1 block text-sm font-medium">
          Design name <span aria-hidden className="text-destructive">*</span>
        </label>
        <input
          id="wiz-name"
          name="name"
          type="text"
          required
          defaultValue="New design"
          data-testid="wizard-name"
          placeholder="e.g. Blomster 3"
          className="h-9 w-full rounded-sm border border-input bg-card px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
        />
      </div>

      {/* ── error + submit ─────────────────────────────────────────────── */}
      {state?.error && (
        <p
          role="alert"
          data-testid="wizard-error"
          className="mb-4 text-sm text-destructive"
        >
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={creating || suppliers.length === 0}
        data-testid="wizard-submit"
        className="h-10 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {creating ? "Creating…" : "Create design"}
      </button>
    </form>
  );
}
