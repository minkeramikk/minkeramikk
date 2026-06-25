"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
import { OptionCard } from "@/components/ui-domain/option-card";
import { useWarmupPreviews } from "@/components/ui-domain/hover-preview";
import { FloatingPreview } from "./floating-preview";
import { PreviewCanvas } from "@/components/ui-domain/preview-canvas";
import { Stepper } from "@/components/ui-domain/stepper";
import { Swatch } from "@/components/ui-domain/swatch";
import { Button } from "@/components/ui/button";
import { assetUrl } from "@/lib/storage";
import { getPreviewLayers, type SelectedCategory } from "@/lib/configurator/preview";
import {
  configuratorReducer,
  initialConfiguratorState,
  type SyncCategory,
} from "@/lib/configurator/state";
import {
  ConfigCodeError,
  decodeConfigCode,
  encodeConfigCode,
  toCodecDesign,
  type CodecDesign,
} from "@/lib/configurator/config-code";
import { pickDefaultOption } from "@/lib/configurator/default-option";
import { ConfigCodeBar } from "./config-code-bar";
import { cn } from "@/lib/utils";
import type { DesignDetail } from "@/lib/catalog/design-options";
import type { PreviewLayer } from "@/lib/configurator/preview";

export interface DesignChoice {
  id: string;
  slug: string;
  name: string;
  supplierId: string;
  supplierName: string | null;
  previewImage: string | null;
  defaultLayers: PreviewLayer[];
}

/** Resolve the selected option per category from URL params, defaulting to the first. */
function resolveSelections(
  detail: DesignDetail,
  params: URLSearchParams
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const cat of detail.categories) {
    const fromUrl = params.get(`opt_${cat.slug}`);
    const valid = cat.options.find((o) => o.id === fromUrl);
    out[cat.slug] = valid?.id ?? pickDefaultOption(cat.options)?.id ?? "";
  }
  return out;
}

/**
 * Unified configurator shell for steps 1 and 2 (F14). The PreviewCanvas is
 * mounted ONCE here and never remounts across the step change — only the right
 * panel swaps (design grid ↔ categories). The preview is the continuity element.
 * Step 3 (ceramics + cart) is a different layout, rendered by the server page.
 */
export function ConfiguratorClient({
  designs,
  detailsBySlug,
  teaserProducts = {},
  featuredSlot = null,
}: {
  designs: DesignChoice[];
  detailsBySlug: Record<string, DesignDetail>;
  /** CA-6: supplierId → up to 3 product image paths for the step-2 teaser. */
  teaserProducts?: Record<string, string[]>;
  /** F28: server-rendered featured strip — step 1 only, between stepper and grid. */
  featuredSlot?: React.ReactNode;
}) {
  const t = useTranslations("configurator");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  /** F31: the big preview's container — observed by the mobile floating bubble */
  const previewRef = useRef<HTMLDivElement>(null);

  const step = searchParams.get("step") === "2" ? 2 : 1;
  const urlSlug = searchParams.get("design");
  const selected =
    designs.find((d) => d.slug === urlSlug) ?? designs[0]; // sort_order=1 default (AC1)
  const detail = detailsBySlug[selected.slug];
  const colorLock = searchParams.get("lock") === "1";

  const selections = useMemo(
    () => resolveSelections(detail, new URLSearchParams(searchParams.toString())),
    [detail, searchParams]
  );

  // R2-2b: custom colour note. Lives in component state during steps 1–2; it is
  // written into the working URL (note=) only on the way to step 3 (goToStep),
  // so the server-rendered step-3 snapshot can pick it up. It never enters the
  // config code nor the set= link. // TODO:nb-review — Norwegian copy from card.
  const noteFromUrl = searchParams.get("note") ?? "";
  const [noteMode, setNoteMode] = useState<"default" | "custom">(
    noteFromUrl ? "custom" : "default"
  );
  const [noteText, setNoteText] = useState(noteFromUrl);
  const noteTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset the note when the selected design changes (the block is per design;
  // a different design is a different config).
  useEffect(() => {
    const fromUrl = new URLSearchParams(searchParams.toString()).get("note") ?? "";
    setNoteText(fromUrl);
    setNoteMode(fromUrl ? "custom" : "default");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key on design only
  }, [selected.slug]);

  // Focus the textarea when "I'll choose" is selected (AC3, also for SR users).
  useEffect(() => {
    if (noteMode === "custom") noteTextareaRef.current?.focus();
  }, [noteMode]);

  // compose preview layers from the current selections (defaults at first paint)
  const previewLayers = useMemo(() => {
    const cats: SelectedCategory[] = detail.categories.map((c) => {
      const opt = c.options.find((o) => o.id === selections[c.slug]);
      return { layerSlot: c.layerSlot, layerImage: opt?.layerImage ?? null };
    });
    // F26.1: no width override — assetUrl derives the class width (designs@512),
    // the SAME URL the server page preloads (browser cache hit, no double fetch)
    return getPreviewLayers(null, cats).map((l) => ({
      src: assetUrl(l.src),
      recolor: l.blend === "multiply",
    }));
  }, [detail, selections]);

  // E (R2): the selected figure (kind=image option) shown read-only beside the
  // colour-notes toggle — pure reference, never a picker. Reactive on selection.
  const selectedFigure = useMemo(() => {
    const figureCat = detail.categories.find((c) => c.kind === "image");
    if (!figureCat) return null;
    const opt = figureCat.options.find((o) => o.id === selections[figureCat.slug]);
    if (!opt) return null;
    const art = opt.image ?? opt.layerImage;
    return art ? { name: opt.name, art } : null;
  }, [detail, selections]);

  const syncCategories: SyncCategory[] = useMemo(
    () =>
      detail.categories.map((c) => {
        const optionHex: Record<string, string | null> = {};
        const hexToOption: Record<string, string> = {};
        for (const o of c.options) {
          optionHex[o.id] = o.hex;
          if (o.hex && !(o.hex in hexToOption)) hexToOption[o.hex] = o.id;
        }
        return { slug: c.slug, syncGroup: c.syncGroup, optionHex, hexToOption };
      }),
    [detail]
  );
  const hasSyncGroup = detail.categories.some((c) => c.syncGroup);

  // R1-FB2: warm the hover-popup images (colour options' layerImage) in idle,
  // desktop-only — first hover shows instantly. Same assetUrl the Swatch
  // popup uses, so the cache hit is guaranteed. Design switch → new URLs
  // warm up, already-warmed ones are skipped (module-level Set).
  const warmupUrls = useMemo(
    () =>
      detail.categories.flatMap((c) =>
        c.kind === "color"
          ? c.options.map((o) => (o.layerImage ? assetUrl(o.layerImage) : null))
          : []
      ),
    [detail]
  );
  useWarmupPreviews(warmupUrls);

  // ── CA-6: "what's next" teaser under the preview (informative only) ──
  // step 1 → swatches of the SELECTED design's first colour category;
  // step 2 → the supplier's ceramic thumbs (F26 @256 variants, lazy).
  /** First dots fully opaque, the rest ramp down — "there's more". */
  const TEASER_CRISP = 4;
  /** Decorative colour-teaser dots (step 1): FIXED, identical for every design,
   *  no assets/fetch. Illustrative content colours, not theme tokens. */
  const TEASER_PALETTE = [
    "#c9a3c4",
    "#7d4f9c",
    "#5a8f7b",
    "#3e8ea2",
    "#d9b36a",
    "#cf7b6b",
    "#9bb7d4",
  ];
  const teaserThumbs = teaserProducts[selected.supplierId] ?? [];
  // step 1 teaser is now static → always shown; step 2 still needs real thumbs.
  const showTeaser = step === 1 ? true : teaserThumbs.length > 0;

  // ── F15 / QA#3: keep the live preview visible while the option list scrolls ──
  // Desktop: the preview column is sticky (CSS only, md:sticky). Mobile: it scrolls
  // normally with the content. The old mobile collapse-to-thumbnail (zero-height
  // sentinel + IntersectionObserver + width toggle) was removed: with threshold 0
  // and no hysteresis it flip-flopped at the boundary (mobile URL-bar resize churn)
  // → the preview "flipped" continuously. A tested mobile sticky preview can return
  // in the dedicated mobile QA pass.

  // ── config code (ADR 0011): encode current, decode on paste ──
  const codecDesigns = useMemo(
    () =>
      Object.values(detailsBySlug)
        .map((d) => toCodecDesign(d))
        .filter((d): d is CodecDesign => d !== null),
    [detailsBySlug]
  );
  const currentCode = useMemo(() => {
    const cd = toCodecDesign(detail);
    return cd ? encodeConfigCode(cd, selections) : "";
  }, [detail, selections]);
  const shareUrl =
    typeof window !== "undefined"
      ? (() => {
          const p = new URLSearchParams(searchParams.toString());
          p.delete("note"); // R2-2b: the note lives in the order, not the link
          return `${window.location.origin}${window.location.pathname}?${p.toString()}`;
        })()
      : "";

  function applyCode(raw: string): boolean {
    try {
      const { designSlug, selections: sel } = decodeConfigCode(raw, (code) =>
        codecDesigns.find((d) => d.code === code.toUpperCase()) ?? null
      );
      const params = new URLSearchParams(searchParams.toString());
      params.set("design", designSlug);
      for (const key of [...params.keys()])
        if (key.startsWith("opt_")) params.delete(key);
      for (const [catSlug, optId] of Object.entries(sel))
        params.set(`opt_${catSlug}`, optId);
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
      return true;
    } catch (e) {
      if (e instanceof ConfigCodeError) return false;
      throw e;
    }
  }

  // F19: a ?code= deep-link (cart-row "reopen" or a shared link) is decoded once
  // on arrival into the canonical opt_* params, then dropped from the URL.
  useEffect(() => {
    const incoming = searchParams.get("code");
    if (!incoming) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("code");
    try {
      const { designSlug, selections: sel } = decodeConfigCode(
        incoming,
        (c) => codecDesigns.find((d) => d.code === c.toUpperCase()) ?? null
      );
      params.set("design", designSlug);
      for (const key of [...params.keys()])
        if (key.startsWith("opt_")) params.delete(key);
      for (const [catSlug, optId] of Object.entries(sel))
        params.set(`opt_${catSlug}`, optId);
    } catch {
      /* invalid code → just drop the param, never crash */
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [searchParams, codecDesigns, pathname, router]);

  function selectDesign(d: DesignChoice) {
    if (d.slug === selected.slug) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("design", d.slug);
    // a new design resets option selections (different categories)
    for (const key of [...params.keys()]) {
      if (key.startsWith("opt_")) params.delete(key);
    }
    params.delete("lock");
    params.delete("note"); // R2-2b: a new design starts without a note
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function selectOption(categorySlug: string, optionId: string) {
    // run through the reducer so color-lock sync (ADR 0004) is applied
    const base = {
      ...initialConfiguratorState,
      designSlug: selected.slug,
      supplierId: selected.supplierId,
      selections,
      colorLock,
    };
    const next = configuratorReducer(base, {
      type: "selectOption",
      categorySlug,
      optionId,
      categories: syncCategories,
    });
    const params = new URLSearchParams(searchParams.toString());
    for (const cat of detail.categories) {
      const sel = next.selections[cat.slug];
      if (sel) params.set(`opt_${cat.slug}`, sel);
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function toggleLock(locked: boolean) {
    const params = new URLSearchParams(searchParams.toString());
    if (locked) params.set("lock", "1");
    else params.delete("lock");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function goToStep(target: 1 | 2 | 3) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("design", selected.slug);
    if (target === 1) params.delete("step");
    else params.set("step", String(target));
    // R2-2b: carry the note forward only when the design accepts it and the
    // customer chose "I'll choose"; otherwise it is the studio default.
    if (detail.acceptsCustomNotes && noteMode === "custom" && noteText.trim()) {
      params.set("note", noteText.trim());
    } else {
      params.delete("note");
    }
    // CA-6b: default scroll (top) on step change — the new step starts from
    // its beginning; option selects keep scroll:false (same view).
    router.push(`${pathname}?${params.toString()}`);
  }

  function label(c: DesignDetail["categories"][number]) {
    return (locale === "no" ? c.labelNo : c.labelEn) ?? c.slug;
  }

  // ARIA radiogroup keyboard pattern (AC6): arrows move focus AND select,
  // Home/End jump to ends; selection follows focus.
  function onRadioKeyDown(
    e: React.KeyboardEvent<HTMLDivElement>,
    cat: DesignDetail["categories"][number]
  ) {
    const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const radios = Array.from(
      e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')
    );
    if (radios.length === 0) return;
    const curr = radios.indexOf(document.activeElement as HTMLElement);
    let next = curr < 0 ? 0 : curr;
    if (e.key === "ArrowRight" || e.key === "ArrowDown")
      next = (curr + 1) % radios.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
      next = (curr - 1 + radios.length) % radios.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = radios.length - 1;
    radios[next]?.focus();
    const optId = cat.options[next]?.id;
    if (optId) selectOption(cat.slug, optId);
  }

  // AC3 / F13: two-way note toggle as a radiogroup (arrows/Home/End move + select).
  function onNoteKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const order: ("default" | "custom")[] = ["default", "custom"];
    const idx = order.indexOf(noteMode);
    let next = idx;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (idx + 1) % 2;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (idx + 1) % 2;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = 1;
    else return;
    e.preventDefault();
    setNoteMode(order[next]);
  }

  // CA-6 / CA-6b: informative teaser of the NEXT step — not clickable (no
  // role, no handler; decision 2026-06-12). Rendered twice: desktop under the
  // sticky preview (F15), mobile at the END of the options column (CA-6b) so
  // it never lengthens the scroll to the options (the CA-2 pain point).
  // Images: existing F26 variants only, lazy.
  function renderTeaser(className: string) {
    return (
      <div
        data-testid="next-step-teaser"
        data-design={selected.slug}
        className={`${className} flex items-center gap-4 rounded-sm border border-border bg-card/55 p-4`}
      >
        {step === 1 ? (
          // Decorative colour teaser: FIXED dots, identical for every design,
          // no <img>/assetUrl → never refetches on design change (the old
          // per-design swatch images reloaded each click). Opacity ramp keeps
          // the "there's more" tail.
          <div className="flex shrink-0" aria-hidden>
            {TEASER_PALETTE.map((color, i) => (
              <span
                key={color}
                className="-ml-2.5 size-8 rounded-full first:ml-0"
                style={{
                  background: color,
                  ...(i >= TEASER_CRISP
                    ? { opacity: Math.max(0.3, 0.75 - (i - TEASER_CRISP) * 0.2) }
                    : {}),
                }}
              />
            ))}
          </div>
        ) : (
          <div className="flex shrink-0 gap-2.5" aria-hidden>
            {teaserThumbs.map((img) => (
              // eslint-disable-next-line @next/next/no-img-element -- catalog art from storage
              <img
                key={img}
                src={assetUrl(img)}
                alt=""
                loading="lazy"
                decoding="async"
                className="size-12 rounded-sm border border-border bg-card object-contain"
              />
            ))}
          </div>
        )}
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
            {t("teaser.nextStep")}
          </p>
          <p className="truncate text-sm font-medium">
            {step === 1 ? t("teaser.colors") : t("teaser.ceramics")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="configurator">
      {/* CA-2: the top cluster holds ONLY the stepper (orientation + step
          jumps, F18). The advance/back CTAs moved in-flow to the END of the
          options column — no fixed bottom bar on mobile (thumb-tap issue),
          no climb back to the top on desktop. Decision closed with the
          client's written ok (mockup-ca2-next-button.html). */}
      <div className="mb-4" data-testid="step-nav">
        <Stepper
          ariaLabel={t("stepperLabel")}
          current={step - 1}
          steps={[
            { label: t("steps.design") },
            { label: t("steps.details") },
            { label: t("steps.ceramics") },
          ]}
          onStepSelect={(i) => goToStep((i + 1) as 1 | 2 | 3)}
          className="mb-0 mt-0"
        />
      </div>

      {/* F28: featured strip between stepper and grid (wireframe v2), home only */}
      {step === 1 && featuredSlot}

      {/* R2-6 A: editorial hero — the public root redirects here, so step 1 IS
          the homepage. Sits between the featured strip and the design grid,
          step-1 only. Copy is hardcoded i18n (no schema, no admin editing). */}
      {step === 1 && (
        <div data-testid="step1-hero" className="mb-6 max-md:pt-1">
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
            {t("step1.hero.title")}
          </h2>
          <p className="mt-2 max-w-prose text-sm text-muted-foreground md:text-base">
            {t("step1.hero.subtitle")}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-7 md:grid-cols-2">
        {/* LEFT: the persistent preview — never remounts across steps (AC2).
            F15: sticky so it stays visible while the option list scrolls; on
            mobile it pins to the top.
            CA-7 (variant B): on mobile STEP 1 only, this column drops BELOW the
            design grid (max-md:order-last) and the hero shrinks to a compact
            "Valgt: {name}" confirmation — design-first browsing. Same
            PreviewCanvas instance, toggled purely via CSS (order + width), never
            remounted. Desktop and steps 2–3 are unchanged. */}
        <div
          className={cn(
            "z-30 flex min-w-0 flex-col gap-3 md:sticky md:top-4 md:self-start",
            // CA-7 (variant B): design-first on mobile step 1 — the hero is
            // hidden entirely (the design cards double as the preview). It stays
            // MOUNTED (display:none only) so the same PreviewCanvas instance
            // comes back full-size from step 2 with no remount (F14). Desktop
            // and steps 2–3 are unchanged.
            step === 1 && "max-md:hidden"
          )}
        >
          <div
            ref={previewRef}
            data-testid="preview-sticky"
            className="max-md:mx-auto max-md:w-full"
          >
            <PreviewCanvas
              alt={selected.name}
              caption={t("previewNote")}
              layers={previewLayers}
            />
          </div>
          {/* CA-6: informative teaser of the NEXT step — desktop instance,
              inside the sticky block so it follows the preview (F15). */}
          {showTeaser && renderTeaser("max-md:hidden")}
        </div>

        {/* RIGHT: panel swaps with the step */}
        {step === 1 ? (
          <div
            className="flex min-w-0 flex-col max-md:pb-20"
            data-testid="design-step"
            data-supplier-id={selected.supplierId}
          >
            <p className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
              {t("stepIndicator", { step: 1 })}
            </p>
            <h2 className="mb-4 mt-1 text-xl font-semibold">{t("step1.title")}</h2>
            <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {designs.map((d) => (
                <OptionCard
                  key={d.id}
                  label={d.name}
                  supplierName={d.supplierName ?? undefined}
                  // CA-7: design-as-a-button — composited plate from the same
                  // default layers the preview uses (zero new assets).
                  layers={d.defaultLayers.map((l) => ({
                    src: assetUrl(l.src),
                    recolor: l.blend === "multiply",
                  }))}
                  selected={d.slug === selected.slug}
                  onSelect={() => selectDesign(d)}
                />
              ))}
            </div>
            {/* CA-6b: mobile teaser sits right BEFORE the CTA — "what's next"
                read before tapping Next (card decision 2026-06-12; also keeps
                the f18 invariant: nav block closed only by the code bar).
                mb-6 = the step-2 column's gap-6, so the teaser→CTA breathing
                room matches across steps (this column has no flex gap). */}
            {showTeaser && renderTeaser("md:hidden mt-3 mb-6")}
            {/* CA-2: advance CTA closes the options column — natural end of
                the flow, single instance for every viewport. No Back here:
                step 1 is the first step. */}
            <div data-testid="step-nav-flow">
              <Button
                size="lg"
                data-testid="next-step"
                className="min-h-11 w-full"
                onClick={() => goToStep(2)}
              >
                {t("nextStepDetails")} ›
              </Button>
            </div>
            {/* F19 save/share — moved from under the preview to the action
                column, below the CTA (CA-6 follow-up, 2026-06-12) */}
            {currentCode && (
              <div className="mt-3">
                <ConfigCodeBar
                  code={currentCode}
                  shareUrl={shareUrl}
                  onApply={applyCode}
                />
              </div>
            )}
            {/* R2-1b: mobile-only sticky CTA — after choosing a design the
                "Next step" is reachable without scrolling to the bottom of the
                grid. Desktop keeps the in-column CTA above (unchanged). Step 1
                only: the F31 floating preview mounts on step 2, so no overlap.
                Keeps the config in the URL via goToStep (design + opt_* + lock). */}
            <div
              data-testid="next-step-mobile-bar"
              className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden"
              style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
            >
              <Button
                size="lg"
                data-testid="next-step-mobile"
                className="min-h-11 w-full"
                onClick={() => goToStep(2)}
              >
                {t("teaser.nextStep")} ›
              </Button>
            </div>
          </div>
        ) : (
          <div
            className="flex min-w-0 flex-col gap-6"
            data-testid="details-step"
            data-color-lock={colorLock ? "1" : "0"}
          >
            <div>
              <p className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                {t("stepIndicator", { step: 2 })}
              </p>
              <h2 className="mt-1 text-xl font-semibold">{selected.name}</h2>
            </div>

            {hasSyncGroup && (
              <label className="flex items-center gap-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={colorLock}
                  onChange={(e) => toggleLock(e.target.checked)}
                  className="size-4 accent-[var(--mk-accent)]"
                  data-testid="color-lock"
                />
                <span>
                  <span className="font-medium">{t("lockColors")}</span>
                  <span className="ml-2 text-muted-foreground">
                    {t("lockColorsHint")}
                  </span>
                </span>
              </label>
            )}

            {detail.categories.map((cat) => {
              const sel = selections[cat.slug];
              const single = cat.options.length === 1;
              // R1-FB1: the selected COLOUR's name doubles the swatch as text
              // (manager+ceramist double check). Catalog proper noun, no i18n.
              // Derived from `selections` (URL params), so click, keyboard,
              // ?code= reloads and sync_group (color-lock) all update it.
              const selectedName =
                cat.kind === "color"
                  ? cat.options.find((o) => o.id === sel)?.name
                  : undefined;
              return (
                <fieldset
                  key={cat.id}
                  data-testid={`category-${cat.slug}`}
                  className="min-w-0"
                >
                  <legend className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em]">
                    {label(cat)}
                    {selectedName && (
                      <span
                        data-testid="legend-selected"
                        className="ml-1.5 font-medium normal-case tracking-normal text-muted-foreground"
                      >
                        <span className="sr-only">{t("selectedLabel")} </span>
                        · {selectedName}
                      </span>
                    )}
                    {single && (
                      <span className="ml-2 font-normal text-muted-foreground">
                        {t("singleOption")}
                      </span>
                    )}
                  </legend>

                  {single ? null : cat.kind === "color" ? (
                    // F15: full vertical grid that wraps — every option visible,
                    // no horizontal scroller (supersedes the F02 embla carousel).
                    <div
                      role="radiogroup"
                      aria-label={label(cat)}
                      onKeyDown={(e) => onRadioKeyDown(e, cat)}
                      data-testid="option-grid"
                      className="flex flex-wrap gap-2.5"
                    >
                      {cat.options.map((o) => (
                        <Swatch
                          key={o.id}
                          hex={o.hex ?? "#000"}
                          name={o.name}
                          selected={sel === o.id}
                          tabIndex={sel === o.id ? 0 : -1}
                          imageSrc={o.image ? assetUrl(o.image) : undefined}
                          previewSrc={
                            o.layerImage ? assetUrl(o.layerImage) : undefined
                          }
                          previewAlt={o.name}
                          onSelect={() => selectOption(cat.slug, o.id)}
                        />
                      ))}
                    </div>
                  ) : (
                    <div
                      data-testid="option-grid"
                      className="grid grid-cols-3 gap-2.5 sm:grid-cols-4"
                    >
                      {cat.options.map((o) => (
                        <OptionCard
                          key={o.id}
                          label={o.name}
                          imageUrl={o.image ? assetUrl(o.image) : undefined}
                          selected={sel === o.id}
                          onSelect={() => selectOption(cat.slug, o.id)}
                        />
                      ))}
                    </div>
                  )}
                </fieldset>
              );
            })}

            {/* R2-2b: custom colour note block — only when the design supports it (AC2).
                The note lives in state + URL param only; it never enters selections or
                previewLayers (AC3, no-preview-mutation invariant). */}
            {detail.acceptsCustomNotes && (
              <section
                data-testid="custom-notes"
                className="rounded-sm border border-border bg-card/40 p-4"
              >
                <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.06em]">
                  {t("customNotes.title")}
                </h3>
                <div className="mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:items-start">
                  <div
                    role="radiogroup"
                    aria-label={t("customNotes.title")}
                    onKeyDown={onNoteKeyDown}
                    data-testid="custom-notes-toggle"
                    className="flex flex-1 flex-col gap-2"
                  >
                    {(["default", "custom"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        role="radio"
                        aria-checked={noteMode === mode}
                        tabIndex={noteMode === mode ? 0 : -1}
                        data-testid={`custom-notes-${mode}`}
                        onClick={() => setNoteMode(mode)}
                        className={[
                          "flex min-h-11 items-center gap-2 rounded-sm border-[1.5px] px-3 text-left text-sm transition-colors",
                          "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                          noteMode === mode
                            ? "border-primary bg-primary/5"
                            : "border-border bg-card hover:border-ring",
                        ].join(" ")}
                      >
                        {mode === "default"
                          ? t("customNotes.optionDefault")
                          : t("customNotes.optionCustom")}
                      </button>
                    ))}
                  </div>

                  {selectedFigure && (
                    <div
                      data-testid="colour-notes-figure"
                      className="flex shrink-0 flex-col items-center gap-1 rounded-sm border border-border bg-muted/40 p-2 sm:w-28"
                    >
                      <span className="text-center text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        {t("customNotes.selectedFigure")}
                      </span>
                      {/* eslint-disable-next-line @next/next/no-img-element -- catalog art from storage */}
                      <img
                        src={assetUrl(selectedFigure.art)}
                        alt={selectedFigure.name}
                        className="size-16 object-contain"
                      />
                      <span className="text-center text-xs text-muted-foreground">
                        {selectedFigure.name}
                      </span>
                    </div>
                  )}
                </div>

                {noteMode === "custom" && (
                  <div className="mt-3">
                    <textarea
                      ref={noteTextareaRef}
                      data-testid="custom-notes-text"
                      value={noteText}
                      maxLength={250}
                      rows={3}
                      onChange={(e) => setNoteText(e.target.value)}
                      placeholder={t("customNotes.placeholder")}
                      aria-describedby="custom-notes-helper"
                      className="w-full rounded-sm border border-input bg-card p-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                    />
                    <div className="mt-1 flex items-start justify-between gap-3">
                      <p
                        id="custom-notes-helper"
                        data-testid="custom-notes-helper"
                        className="text-xs text-muted-foreground"
                      >
                        {t("customNotes.helper")}
                      </p>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {t("customNotes.counter", { count: noteText.length })}
                      </span>
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* CA-6b: mobile teaser right BEFORE the CTA (see step 1) */}
            {showTeaser && renderTeaser("md:hidden")}
            {/* CA-2: Back + advance close the options column (last in DOM →
                natural tab order: options → CTA). */}
            <div className="flex gap-3" data-testid="step-nav-flow">
              <Button
                variant="outline"
                size="lg"
                data-testid="back-step"
                className="min-h-11 shrink-0"
                onClick={() => goToStep(1)}
              >
                ‹ {t("back")}
              </Button>
              <Button
                size="lg"
                data-testid="next-step"
                className="min-h-11 flex-1"
                onClick={() => goToStep(3)}
              >
                {t("nextStepCeramic")} ›
              </Button>
            </div>
            {/* F19 save/share — action column, below the CTA (see step 1) */}
            {currentCode && (
              <ConfigCodeBar
                code={currentCode}
                shareUrl={shareUrl}
                onApply={applyCode}
              />
            )}
          </div>
        )}
      </div>

      {/* F31: mobile-only floating mini-plate, step 2 only (step 1 has the
          design grid previews, step 3 the cart panel). Fixed OVERLAY sibling
          of the layout — its visibility can never reflow the page. */}
      {step === 2 && (
        <FloatingPreview targetRef={previewRef} layers={previewLayers} />
      )}
    </div>
  );
}
