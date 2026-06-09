"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { DEFAULT_THEME, type ThemeTokens } from "@/lib/theme";
import { checkThemeContrast } from "@/lib/theme-contrast";
import { updateTheme, type ThemeState } from "./actions";

/**
 * Theme editor (F11a): 3 colour pickers + a live site preview + a blocking WCAG
 * AA check on the key derived pairs. Setting --mk-* on the preview container
 * re-derives every token via color-mix (ADR 0008), so the preview shows exactly
 * what the public site will look like. Save persists to `settings`; the public
 * re-themes on refresh.
 */
const FIELDS: { key: keyof ThemeTokens; label: string; desc: string }[] = [
  { key: "light", label: "Light", desc: "Backgrounds & surfaces" },
  { key: "dark", label: "Dark", desc: "Text, header & sidebar" },
  { key: "accent", label: "Accent", desc: "Buttons, selections, highlights" },
];

export function ThemeEditor({ initial }: { initial: ThemeTokens }) {
  const [tokens, setTokens] = useState<ThemeTokens>(initial);
  const [state, formAction, pending] = useActionState<ThemeState, FormData>(
    updateTheme,
    { error: null }
  );

  const check = checkThemeContrast(tokens);

  const set = (key: keyof ThemeTokens, value: string) =>
    setTokens((t) => ({ ...t, [key]: value }));

  return (
    <div
      data-testid="theme-editor"
      className="grid gap-6 lg:grid-cols-[320px_1fr]"
    >
      {/* controls */}
      <form action={formAction} className="flex flex-col gap-4">
        {FIELDS.map((f) => (
          <label key={f.key} className="flex items-center gap-3">
            <input
              type="color"
              name={f.key}
              value={tokens[f.key]}
              data-testid={`picker-${f.key}`}
              onChange={(e) => set(f.key, e.target.value)}
              className="size-10 shrink-0 cursor-pointer rounded border border-border bg-card"
            />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{f.label}</span>
              <span className="block text-xs text-muted-foreground">{f.desc}</span>
            </span>
            <code className="font-mono text-xs text-muted-foreground tabular-nums">
              {tokens[f.key]}
            </code>
          </label>
        ))}

        {/* WCAG AA status */}
        <div
          data-testid="aa-status"
          data-ok={check.ok}
          className="rounded-lg border border-border p-3 text-sm"
        >
          <p className="mb-2 font-medium">Contrast (WCAG AA · 4.5:1)</p>
          <ul className="flex flex-col gap-1">
            {check.pairs.map((p) => (
              <li
                key={p.id}
                data-testid={`aa-${p.id}`}
                data-pass={p.passes}
                className="flex items-center justify-between gap-2"
              >
                <span className={p.passes ? "text-foreground" : "text-destructive"}>
                  {p.passes ? "✓" : "✕"} {p.label}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {p.ratio.toFixed(2)}:1
                </span>
              </li>
            ))}
          </ul>
          {!check.ok && (
            <p data-testid="aa-hint" className="mt-2 text-xs text-destructive">
              {check.failures.map((f) => f.hint).join(" ")}
            </p>
          )}
        </div>

        {state.error && (
          <p data-testid="save-error" className="text-sm text-destructive">
            {state.error}
          </p>
        )}
        {state.ok && (
          <p data-testid="save-ok" className="text-sm text-foreground">
            Saved — the site is re-themed.
          </p>
        )}

        <div className="flex gap-3">
          <Button
            type="submit"
            data-testid="theme-save"
            disabled={!check.ok || pending}
          >
            {pending ? "Saving…" : "Save theme"}
          </Button>
          <Button
            type="button"
            variant="outline"
            data-testid="theme-reset"
            onClick={() => setTokens(DEFAULT_THEME)}
          >
            Reset to defaults
          </Button>
        </div>
      </form>

      {/* live preview — overriding --mk-* re-derives every token via color-mix */}
      <div
        data-testid="theme-preview"
        style={
          {
            "--mk-light": tokens.light,
            "--mk-dark": tokens.dark,
            "--mk-accent": tokens.accent,
          } as React.CSSProperties
        }
        className="overflow-hidden rounded-lg border border-border"
      >
        <div className="flex items-center justify-between bg-ink px-4 py-3 text-ink-foreground">
          <span className="font-heading font-semibold text-white">minkeramikk</span>
          <span className="text-xs text-ink-muted">NO / EN</span>
        </div>
        <div className="bg-background p-5 text-foreground">
          <h3 className="text-lg font-semibold">Live preview</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Secondary / muted text on the page background.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
              Send order
            </span>
            <span className="rounded-md border border-border bg-card px-3 py-2 text-sm text-card-foreground">
              Card surface
            </span>
            <span className="rounded-md bg-muted px-3 py-2 text-sm text-foreground">
              Muted
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
