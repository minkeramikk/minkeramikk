"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
import { OptionCard } from "@/components/ui-domain/option-card";
import { useWarmupPreviews } from "@/components/ui-domain/hover-preview";
import { DesignDescription } from "./design-description";
import { DesignPhotoStrip } from "./design-photo-strip";
import { hasPhotos } from "./design-photos";
import { FloatingPreview } from "./floating-preview";
import { PreviewCanvas } from "@/components/ui-domain/preview-canvas";
import { Stepper } from "@/components/ui-domain/stepper";
import { Swatch } from "@/components/ui-domain/swatch";
import { NextStepPill, PillIcon } from "@/components/ui-domain/next-step-pill";
import { ChevronLeft, Circle } from "lucide-react";
import { assetUrl } from "@/lib/storage";
import { getPreviewLayers, type SelectedCategory } from "@/lib/configurator/preview";
import {
  configuratorReducer,
  initialConfiguratorState,
  type SyncCategory,
} from "@/lib/configurator/state";
import {
  decodeConfigCode,
  toCodecDesign,
  type CodecDesign,
} from "@/lib/configurator/config-code";
import { pickDefaultOption } from "@/lib/configurator/default-option";
import { fullRowInsertIndex } from "@/lib/configurator/grid-rows";
import { cn } from "@/lib/utils";
import type { DesignDetail } from "@/lib/catalog/design-options";
import type { PreviewLayer } from "@/lib/configurator/preview";

export interface DesignChoice {
  id: string;
  slug: string;
  /** Legacy single-language name (kept for the config codec / fallback). */
  name: string;
  nameNo: string;
  nameEn: string;
  supplierId: string;
  supplierName: string | null;
  /** R3-B23: per-locale description shown in the step-1 contextual block. */
  descriptionNo: string | null;
  descriptionEn: string | null;
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
  ceramicThumbs = {},
  featuredSlot = null,
}: {
  designs: DesignChoice[];
  detailsBySlug: Record<string, DesignDetail>;
  /** supplierId → fino a 3 foto di ceramica per l'icona della pillola step 2. */
  ceramicThumbs?: Record<string, string[]>;
  /** F28: server-rendered featured strip — step 1 only, between stepper and grid. */
  featuredSlot?: React.ReactNode;
}) {
  const t = useTranslations("configurator");
  const locale = useLocale();
  /** Design name in the active locale (falls back to NO, then legacy name). */
  const designName = (d: DesignChoice) =>
    (locale === "no" ? d.nameNo : d.nameEn) || d.nameNo || d.name;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  /** F31: the big preview's container — observed by the mobile floating bubble */
  const previewRef = useRef<HTMLDivElement>(null);
  // R-EXTRA: la riga CTA di fine colonna — osservata da FloatingPreview, che si
  // spegne quando questa entra in viewport (la bolla ci finiva sopra).
  const navRef = useRef<HTMLDivElement>(null);
  // R3-B23: live column count (2 under sm, 3 from sm) — same grid as step 3, so
  // the contextual block lands after the LAST card of the selected card's row.
  const [cols, setCols] = useState(2);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const apply = () => setCols(mq.matches ? 3 : 2);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const step = searchParams.get("step") === "2" ? 2 : 1;
  const urlSlug = searchParams.get("design");
  const selected =
    designs.find((d) => d.slug === urlSlug) ?? designs[0]; // sort_order=1 default (AC1)
  const detail = detailsBySlug[selected.slug];
  const colorLock = searchParams.get("lock") === "1";
  // R3-B23: the block describes the SELECTION, so it takes name/description from
  // `selected` and is injected after the last card of the selected card's row.
  const contextBlockAfter = fullRowInsertIndex(
    designs.findIndex((d) => d.slug === selected.slug),
    cols,
    designs.length
  );
  const selectedDescription =
    locale === "no" ? selected.descriptionNo : selected.descriptionEn;

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

  // F38: custom inscription. Lives in state + the working URL (text=) only —
  // never the config code nor the set= link (privacy/lean, like the note).
  const [customText, setCustomText] = useState(searchParams.get("text") ?? "");

  // Reset when the selected design changes (per-design field).
  useEffect(() => {
    setCustomText(new URLSearchParams(searchParams.toString()).get("text") ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key on design only
  }, [selected.slug]);

  // Focus the textarea when "I'll choose" is selected (AC3, also for SR users).
  // R3-A: preventScroll — the textarea is at the page bottom; the default
  // scroll-into-view shifts the IntersectionObserver ratio behind the step-2
  // FloatingPreview, which makes the mini-plate flip (cross-browser, Android +
  // iOS). Focus still lands for SR/keyboard; the keyboard still opens on mobile.
  useEffect(() => {
    if (noteMode === "custom")
      noteTextareaRef.current?.focus({ preventScroll: true });
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

  // ── R-EXTRA: pallini decorativi dell'icona della pillola step 1 (ex teaser
  //    CA-6, rimosso). FISSI e identici per ogni design: nessun asset, nessun
  //    fetch, nessun refetch al cambio design. I primi sono pieni, gli altri
  //    sfumano — "ce n'è dell'altro".
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
  /** Foto ceramica del fornitore del design scelto — icona della pillola step 2. */
  const ceramics = ceramicThumbs[selected.supplierId] ?? [];
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
    // F38: carry the inscription forward only when the design accepts it.
    if (detail.acceptsCustomText && customText.trim()) {
      params.set("text", customText.trim());
    } else {
      params.delete("text");
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

      {/* R2-6 A: how-it-works intro — the public root redirects here, so step 1
          IS the homepage. Sits directly under the stepper, ABOVE the featured
          strip. One–two simple sentences explaining the flow (the 3 steps), not
          a marketing headline. Copy is hardcoded i18n (no schema, no admin). */}
      {step === 1 && (
        <div data-testid="step1-hero" className="mb-5 max-md:pt-1">
          <h2 className="text-xl font-semibold tracking-tight md:text-2xl">
            {t("step1.hero.title")}
          </h2>
          <p className="mt-1.5 max-w-prose text-sm text-muted-foreground">
            {t("step1.hero.subtitle")}
          </p>
        </div>
      )}

      {/* F28: featured strip between the intro and the design grid, home only */}
      {step === 1 && featuredSlot}

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
              alt={designName(selected)}
              caption={t("previewNote")}
              layers={previewLayers}
            />
          </div>
        </div>

        {/* RIGHT: panel swaps with the step */}
        {step === 1 ? (
          <div
            className="flex min-w-0 flex-col"
            data-testid="design-step"
            data-supplier-id={selected.supplierId}
          >
            <p className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
              {t("stepIndicator", { step: 1 })}
            </p>
            <h2 className="mb-4 mt-1 text-xl font-semibold">{t("step1.title")}</h2>
            <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {designs.map((d, i) => (
                <Fragment key={d.id}>
                  <OptionCard
                    label={designName(d)}
                    // CA-7: design-as-a-button — composited plate from the same
                    // default layers the preview uses (zero new assets).
                    layers={d.defaultLayers.map((l) => ({
                      src: assetUrl(l.src),
                      recolor: l.blend === "multiply",
                    }))}
                    selected={d.slug === selected.slug}
                    onSelect={() => selectDesign(d)}
                  />
                  {i === contextBlockAfter && (
                    // R3-B23: contextual block under the SELECTED card's row —
                    // name + per-locale description + explicit next-step CTA.
                    // Replaces the old fixed bottom bar (it sat under the thumb).
                    // The CTA is here on EVERY viewport (client decision
                    // 2026-07-18): this pill is the ONLY next-step path in step 1
                    // (R-EXTRA removed both the old in-flow nav row at the end
                    // of the column and the CA-6 teaser the pill replaces).
                    <div
                      data-testid="design-context-block"
                      style={{ gridColumn: "1 / -1" }}
                      className="rounded-sm border border-border bg-card p-3.5"
                    >
                      <p className="text-sm font-semibold">{designName(selected)}</p>
                      {selectedDescription && (
                        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                          {selectedDescription}
                        </p>
                      )}
                      {/* R-EXTRA: la pillola è l'UNICO CTA "avanti" dello step 1
                          (il teaser sotto la preview e il bottone di fondo griglia
                          sono stati rimossi). Icona = pallini colore, anteprima
                          reale di ciò che si sceglie allo step 2. */}
                      <NextStepPill
                        data-testid="next-step-mobile"
                        className="mt-3 w-full"
                        caption={t("teaser.nextStep")}
                        label={t("teaser.colors")}
                        arrow
                        icon={
                          <span className="flex shrink-0" aria-hidden>
                            {TEASER_PALETTE.map((color, i) => (
                              <span
                                key={color}
                                className={cn(
                                  "-ml-2.5 size-8 rounded-full first:ml-0 max-lg:-ml-3 max-lg:size-7",
                                  // Sotto lg la coda sfumata sparisce e i pallini
                                  // rimpiccioliscono, per lasciare larghezza
                                  // all'etichetta (AC6). Restano i 4 pieni:
                                  // l'anteprima della scelta è intatta, si perde
                                  // solo il "ce n'è dell'altro".
                                  // La soglia è lg, non sm: a 768 la griglia va a
                                  // 2 colonne e il blocco torna largo quanto a
                                  // 390 (~322px) ma coi pallini a misura piena —
                                  // è il caso PEGGIORE, non un caso intermedio.
                                  i >= TEASER_CRISP && "max-lg:hidden"
                                )}
                                style={{
                                  background: color,
                                  ...(i >= TEASER_CRISP
                                    ? {
                                        opacity: Math.max(
                                          0.3,
                                          0.75 - (i - TEASER_CRISP) * 0.2
                                        ),
                                      }
                                    : {}),
                                }}
                              />
                            ))}
                          </span>
                        }
                        onClick={() => goToStep(2)}
                      />
                    </div>
                  )}
                </Fragment>
              ))}
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
              <h2 className="mt-1 text-xl font-semibold">{designName(selected)}</h2>
            </div>

            {/* F36: design description (per-locale) — no text, no block */}
            {(() => {
              const desc =
                locale === "no" ? detail.descriptionStep2No : detail.descriptionStep2En;
              return desc ? <DesignDescription text={desc} /> : null;
            })()}
            {/* F36: real-photo filmstrip — no images, no strip, no placeholder */}
            {hasPhotos(detail.images) && (
              <DesignPhotoStrip
                images={detail.images}
                alt={designName(selected)}
              />
            )}

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
                      className="w-full rounded-sm border border-input bg-card p-2 text-base focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring md:text-sm"
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

            {/* F38: custom inscription — only when the design supports it.
                Plain optional input (no default/custom toggle, unlike the note);
                lives in state + text= URL param only, never the code/preview. */}
            {detail.acceptsCustomText && (
              <section
                data-testid="custom-text"
                className="rounded-sm border border-border bg-card/40 p-4"
              >
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em]">
                  {t("customText.title")}
                </h3>
                <input
                  type="text"
                  data-testid="custom-text-input"
                  value={customText}
                  maxLength={100}
                  onChange={(e) => setCustomText(e.target.value)}
                  placeholder={t("customText.placeholder")}
                  aria-label={t("customText.title")}
                  aria-describedby="custom-text-helper"
                  className="w-full rounded-sm border border-input bg-card p-2 text-base focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring md:text-sm"
                />
                <div className="mt-1 flex items-start justify-between gap-3">
                  <p
                    id="custom-text-helper"
                    data-testid="custom-text-helper"
                    className="text-xs text-muted-foreground"
                  >
                    {t("customText.helper")}
                  </p>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {t("customText.counter", { count: customText.length })}
                  </span>
                </div>
              </section>
            )}

            {/* CA-2: Back + advance close the options column (last in DOM →
                natural tab order: options → CTA).
                R-EXTRA: stessa altezza per i due bottoni (richiesta cliente
                2026-07-21) — la ottiene `items-stretch`, non un'altezza fissa:
                Tilbake a una riga si allunga fino alla pillola a due righe. La
                gerarchia resta, ed è data da outline (Tilbake) vs riempimento
                (pillola). Nessuna freccetta su Tilbake: non fa avanzare.
                R-EXTRA (bugfix mobile): questa riga è l'UNICO next-step dello
                step 2 — la copia mobile in-flow (ex teaser CA-6) è stata
                rimossa: su Pixel 8 erano due pillole identiche impilate.
                R-EXTRA (mockup-mobile-stacked-COMPARE.jpg): quando i due non ci
                stanno affiancati NON basta mandare a capo — l'ordine visivo si
                inverte, il Next va SOPRA a piena larghezza e il Back SOTTO,
                alleggerito e centrato. Da qui `flex-col-reverse` + `@container`:
                la soglia è la larghezza della COLONNA, non del viewport (a 768
                la colonna torna stretta quanto a 390, un breakpoint di viewport
                mancherebbe il caso). Mai troncare l'etichetta del CTA primario:
                era il sintomo che AC10 deve chiudere, non una via d'uscita. */}
            <div ref={navRef} className="@container" data-testid="step-nav-flow">
            <div className="flex flex-col-reverse gap-3 @md:flex-row @md:items-stretch">
              <NextStepPill
                variant="secondary"
                data-testid="back-step"
                // Stacked (colonna stretta): piena larghezza e contenuto
                // centrato come da mockup. Affiancato: torna largo il minimo
                // e allineato a sinistra, così il Next si prende il resto.
                className="justify-center [&>span]:flex-none @md:shrink-0 @md:justify-start"
                label={t("back")}
                icon={
                  <PillIcon variant="secondary">
                    <ChevronLeft className="size-5 text-primary/60" />
                  </PillIcon>
                }
                onClick={() => goToStep(1)}
              />
              <NextStepPill
                data-testid="next-step"
                // Solo affiancato: in colonna `flex-basis` sarebbe l'ALTEZZA
                // (16rem di pillola). Stacked non serve: `stretch` fa già
                // piena larghezza.
                className="@md:flex-[1_1_16rem]"
                caption={t("teaser.nextStep")}
                label={t("teaser.ceramics")}
                arrow
                icon={
                  // Richiesta cliente 2026-07-21: foto REALI di ceramiche, tre
                  // card quadrate affiancate (com'era il teaser CA-6), non
                  // un'icona generica. Stessi asset delle miniature dello step 3
                  // — nessun asset nuovo, nessuna query in più (cache catalogo).
                  // size-9 (non size-11 come il cerchietto che sostituisce): tre
                  // quadrati sono ~116px contro i 44 dell'icona singola, e a
                  // 1280 come a 768 l'etichetta "Velg keramikk" si troncava.
                  // L'etichetta del CTA primario non si tronca MAI (AC10).
                  ceramics.length > 0 ? (
                    <span className="flex shrink-0 gap-1" aria-hidden>
                      {ceramics.map((img) => (
                        // eslint-disable-next-line @next/next/no-img-element -- catalog art from storage
                        <img
                          key={img}
                          src={assetUrl(img)}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          data-testid="next-step-ceramic-thumb"
                          // A colonna stretta (390, e 768 dove la colonna è
                          // altrettanto stretta) i tre quadrati da 36px lasciano
                          // 142px all'etichetta, che ne chiede 144: "Pick your
                          // ceramics" si troncava di 2px. size-8 ne restituisce
                          // 12. L'etichetta del CTA primario non si tronca MAI.
                          className="size-8 rounded-sm border border-border bg-card object-contain @md:size-9"
                        />
                      ))}
                    </span>
                  ) : (
                    // Fornitore senza foto prodotto: si ricade sull'icona neutra
                    // invece di lasciare la pillola monca.
                    <PillIcon>
                      <Circle className="size-5 fill-muted stroke-muted-foreground/50" />
                    </PillIcon>
                  )
                }
                onClick={() => goToStep(3)}
              />
            </div>
            </div>
          </div>
        )}
      </div>

      {/* F31: mobile-only floating mini-plate, step 2 only (step 1 has the
          design grid previews, step 3 the cart panel). Fixed OVERLAY sibling
          of the layout — its visibility can never reflow the page. */}
      {step === 2 && (
        <FloatingPreview
          targetRef={previewRef}
          layers={previewLayers}
          hideNearRef={navRef}
        />
      )}
    </div>
  );
}
