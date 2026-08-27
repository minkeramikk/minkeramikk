"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
import { OptionCard } from "@/components/ui-domain/option-card";
import { useWarmupPreviews } from "@/components/ui-domain/hover-preview";
import { DesignDescription } from "./design-description";
import { DesignPhotoStrip } from "./design-photo-strip";
import { hasPhotos } from "@/lib/configurator/photos";
import { useLaneFades } from "@/lib/configurator/use-lane-fades";
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

/** R4-STEP2: tab del pannello mobile che raccoglie ciò che non è una categoria
 *  (descrizione, foto, lås farger, note, scritta). Costante di modulo, non
 *  esportata: identità stabile fra i render, vive solo in questo file. */
const EXTRAS_TAB = "__extras";

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

  // R4-STEP2: l'editor mobile è < md (768). Serve SOLO per i ruoli ARIA
  // (tablist/tab/tabpanel esistono solo dove esiste la corsia tab): il layout è
  // tutto CSS `max-md:`, quindi il primo paint non sfarfalla.
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const apply = () => setIsDesktop(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const step = searchParams.get("step") === "2" ? 2 : 1;
  const urlSlug = searchParams.get("design");
  const selected =
    designs.find((d) => d.slug === urlSlug) ?? designs[0]; // sort_order=1 default (AC1)
  const detail = detailsBySlug[selected.slug];
  /** Tab attiva del pannello mobile: slug di categoria, oppure `EXTRAS_TAB`. */
  const [activeTab, setActiveTab] = useState<string>(
    detail.categories[0]?.slug ?? EXTRAS_TAB
  );
  // design nuovo = categorie nuove: la tab attiva torna alla prima.
  useEffect(() => {
    setActiveTab(detail.categories[0]?.slug ?? EXTRAS_TAB);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key on design only
  }, [selected.slug]);
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
  // preventScroll resta: su mobile la textarea vive nella tab «Detaljer» del
  // pannello, e lo scroll-into-view del browser sposterebbe la corsia sotto le
  // dita. (La ragione storica — il flip del mini-piatto F31 — è decaduta con
  // la rimozione del FAB, R4-STEP2.)
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

  // R4-STEP2 (mockup .sum): the summary line under the mobile editor canvas —
  // design name + one «category: option» pair per category. Derived from
  // `selections` (URL), so it follows taps, keyboard, ?code= and the lock.
  const summaryLine = useMemo(() => {
    const parts = detail.categories.map((c) => {
      const opt = c.options.find((o) => o.id === selections[c.slug]);
      return `${label(c)}: ${opt?.name ?? "—"}`;
    });
    return [designName(selected), ...parts].join(" · ");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- label/designName are pure locale helpers
  }, [detail, selections, selected, locale]);

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

  // ── R4-STEP2: corsia tab del pannello mobile ──────────────────────────────
  const tabsRef = useRef<HTMLDivElement>(null);
  const tabFades = useLaneFades(
    tabsRef,
    `${selected.slug}:${detail.categories.length}`
  );
  const tabId = (key: string) => `step2-tab-${key}`;
  const tabPanelId = (key: string) => `step2-panel-${key}`;
  /** C'è qualcosa da mettere nella tab «Detaljer»? */
  const hasExtras =
    Boolean(
      locale === "no" ? detail.descriptionStep2No : detail.descriptionStep2En
    ) ||
    hasPhotos(detail.images) ||
    hasSyncGroup ||
    detail.acceptsCustomNotes ||
    detail.acceptsCustomText;

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
    // Leaving steps 1–2 IS the explicit choice: whatever brought the design in
    // (a shared set landing marks it `origin=set`) stops mattering here.
    params.delete("origin");
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

  // R4-STEP2: frecce ←/→ (e Home/End) muovono E attivano la tab, come il
  // radiogroup delle opzioni. Stessa mano, stessa aspettativa.
  function onTabsKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const keys = ["ArrowRight", "ArrowLeft", "Home", "End"];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const tabs = Array.from(
      e.currentTarget.querySelectorAll<HTMLElement>(
        "[data-testid^='category-tab-']"
      )
    );
    if (tabs.length === 0) return;
    const curr = tabs.indexOf(document.activeElement as HTMLElement);
    let next = curr < 0 ? 0 : curr;
    if (e.key === "ArrowRight") next = (curr + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (curr - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else next = tabs.length - 1;
    tabs[next]?.focus();
    tabs[next]?.click();
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
    <div
      data-testid="configurator"
      // R4-STEP2: hook for the :has() rules in globals.css — step 2 only, under
      // md only (the media query lives in the CSS). On desktop and on steps 1/3
      // the attribute is absent and the page scrolls as always.
      data-editor={step === 2 ? "mobile" : undefined}
      className={cn(step === 2 && "max-md:flex max-md:min-h-0 max-md:flex-1 max-md:flex-col")}
    >
      {/* CA-2: the top cluster holds ONLY the stepper (orientation + step
          jumps, F18). The advance/back CTAs live in-flow at the END of the
          options column — no climb back to the top on desktop. Decision closed
          with the client's written ok (mockup-ca2-next-button.html).
          R4-STEP2: under md at step 2 that same row is pinned to the foot of
          the tool panel (sticky inside the panel's scroll port). It is still
          NOT a fixed bottom bar over the page — the old thumb-tap problem was
          a bar floating over scrolling content; here the panel IS the surface
          and the row is its last, always-visible element (mockup .navB). */}
      <div
        className={cn("mb-4", step === 2 && "max-md:mb-2 max-md:flex-none")}
        data-testid="step-nav"
      >
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
          {/* R4-COPY Ⓑ: the intro is two paragraphs, kept in ONE dictionary key
              split by a blank line — `whitespace-pre-line` renders it, no extra
              key and no markup. */}
          <p className="mt-1.5 max-w-prose whitespace-pre-line text-sm text-muted-foreground">
            {t("step1.hero.subtitle")}
          </p>
        </div>
      )}

      {/* F28: featured strip between the intro and the design grid, home only */}
      {step === 1 && featuredSlot}

      <div
        className={cn(
          "grid grid-cols-1 items-start gap-7 md:grid-cols-2",
          // R4-STEP2: at step 2 under md this grid IS the editor — a full-height
          // flex column, canvas on top and panel below, zero gap (the panel has
          // its own border). From md up NOTHING changes.
          // `items-stretch` cancels the grid's `items-start` ONLY here: as a
          // flex column that would shrink-to-fit both children, so a horizontal
          // lane's max-content (a long tab row, a wide option lane) blew the
          // panel out to 1524px inside a 390px viewport — invisible only
          // because `html` is `overflow:hidden` in the editor.
          step === 2 &&
            "max-md:flex max-md:min-h-0 max-md:flex-1 max-md:flex-col max-md:items-stretch max-md:gap-0"
        )}
      >
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
            step === 1 && "max-md:hidden",
            // R4-STEP2: the editor canvas — takes ~55% of the height (mockup:
            // .canvasB{flex:1.15} against .panelB{flex:1}), centres the plate and
            // carries the mockup's soft radial ground (tokens only).
            step === 2 &&
              "max-md:min-h-0 max-md:flex-[1.15] max-md:items-center max-md:justify-center max-md:gap-1 max-md:bg-[radial-gradient(circle_at_50%_42%,color-mix(in_oklab,var(--mk-light),white_55%),var(--background)_78%)]"
          )}
        >
          <div
            data-testid="preview-sticky"
            className={cn(
              "max-md:mx-auto max-md:w-full",
              // R4-STEP2: in the editor the height is the constraint, so the
              // PreviewCanvas box (aspect-square card by default) becomes a
              // transparent full-size area and the plate — already object-contain
              // — fits whichever side is shorter. No change to the shared
              // component: `contents` on its root plus child variants from here.
              // `[&_[data-canvas-frame]]` targets the inner frame via its
              // stable data hook (preview-canvas.tsx), a descendant selector —
              // survives `PreviewCanvas` changing its internal nesting, unlike
              // the structural `[&>div>div]` this replaces.
              // `[&_p]:hidden` kills the long caption (its only <p>); the summary
              // line below sits OUTSIDE this wrapper and is untouched.
              step === 2 &&
                "max-md:flex max-md:min-h-0 max-md:flex-1 max-md:items-center max-md:justify-center max-md:[&_[data-canvas-frame]]:h-full max-md:[&_[data-canvas-frame]]:w-full max-md:[&_[data-canvas-frame]]:max-w-none max-md:[&_[data-canvas-frame]]:bg-transparent max-md:[&_[data-canvas-frame]]:shadow-none max-md:[&_p]:hidden"
            )}
          >
            {/* R4-COPY Ⓒ: the caption is a closed sentence for now — the
                "inspirasjonsside ↗" link (new tab) lands once Alessio gives
                us the URL. */}
            <PreviewCanvas
              alt={designName(selected)}
              caption={t("previewNote")}
              className={cn(step === 2 && "max-md:contents")}
              layers={previewLayers}
            />
          </div>
          {step === 2 && (
            // mockup .sum — one line only, ellipsis when it does not fit. Carries
            // the design name too (the step-2 <h2> is hidden in the editor).
            <p
              data-testid="canvas-summary"
              className="hidden truncate px-3 text-center text-[10.5px] text-muted-foreground max-md:block max-md:w-full max-md:flex-none"
            >
              {summaryLine}
            </p>
          )}
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
            className={cn(
              "flex min-w-0 flex-col gap-6",
              // R4-STEP2 — tool panel (mockup .panelB): edge to edge, rounded
              // top corners, border and shadow from the tokens. It is the ONLY
              // scroll port of the editor (the page itself does not scroll).
              "max-md:-mx-5 max-md:min-h-0 max-md:flex-1 max-md:gap-0 max-md:overflow-y-auto max-md:scroll-pb-[45vh] max-md:scroll-pt-14 max-md:rounded-t-[var(--radius)] max-md:border-t-[1.5px] max-md:border-border max-md:bg-card max-md:px-3 max-md:shadow-[0_-6px_18px_color-mix(in_oklab,var(--mk-dark)_8%,transparent)]"
            )}
            data-testid="details-step"
            data-color-lock={colorLock ? "1" : "0"}
          >
            {/* mockup .grab — panel affordance, decorative. */}
            <span
              aria-hidden
              className="mx-auto hidden h-1 w-10 flex-none rounded-full bg-border max-md:mt-[7px] max-md:block"
            />
            {/* R4-STEP2 (mockup .cats): corsia tab orizzontale — solo mobile.
                Dot = colore selezionato della categoria, conteggio = opzioni.
                I ruoli tab esistono solo dove esiste la corsia (isDesktop).
                `sticky top-0`: il pannello È la porta di scorrimento (Task 3),
                senza questo la corsia — unico indice del pannello — scorrerebbe
                via insieme al contenuto.
                // TODO:nb-review — step2.tabsLabel / step2.tabCount / step2.extrasTab /
                step2.optionsLabel */}
            <div className="sticky top-0 z-10 -mx-3 flex-none bg-card px-3 md:hidden">
              <div
                ref={tabsRef}
                role={isDesktop ? undefined : "tablist"}
                aria-label={isDesktop ? undefined : t("step2.tabsLabel")}
                aria-orientation={isDesktop ? undefined : "horizontal"}
                onKeyDown={onTabsKeyDown}
                data-testid="category-tabs"
                className="flex snap-x snap-proximity gap-1 overflow-x-auto scroll-smooth px-1 pb-0.5 pt-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {detail.categories.map((cat) => {
                  const sel = selections[cat.slug];
                  const selOpt = cat.options.find((o) => o.id === sel);
                  const on = activeTab === cat.slug;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      id={tabId(cat.slug)}
                      role={isDesktop ? undefined : "tab"}
                      aria-selected={isDesktop ? undefined : on}
                      aria-controls={isDesktop ? undefined : tabPanelId(cat.slug)}
                      tabIndex={on ? 0 : -1}
                      data-testid={`category-tab-${cat.slug}`}
                      onClick={() => setActiveTab(cat.slug)}
                      className={cn(
                        "flex min-h-11 flex-none snap-start items-center gap-2 rounded-full px-3.5 text-[12.5px]",
                        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                        on
                          ? "bg-secondary font-semibold text-primary"
                          : "text-muted-foreground"
                      )}
                    >
                      {/* dot = colore attualmente scelto (solo categorie colore) */}
                      {cat.kind === "color" && (
                        <span
                          aria-hidden
                          className="size-3.5 flex-none rounded-full border-[1.5px] border-border"
                          style={{ backgroundColor: selOpt?.hex ?? "transparent" }}
                        />
                      )}
                      {t("step2.tabCount", {
                        name: label(cat),
                        count: cat.options.length,
                      })}
                    </button>
                  );
                })}

                {/* tab in coda: tutto ciò che non è una categoria */}
                {hasExtras && (
                  <button
                    type="button"
                    id={tabId(EXTRAS_TAB)}
                    role={isDesktop ? undefined : "tab"}
                    aria-selected={isDesktop ? undefined : activeTab === EXTRAS_TAB}
                    // la tab «Detaljer» ha DUE contenitori (il DOM desktop
                    // vuole note+scritta in fondo): `aria-controls` prende una
                    // lista di id, quindi li annuncia entrambi.
                    aria-controls={
                      isDesktop
                        ? undefined
                        : `${tabPanelId(EXTRAS_TAB)} ${tabPanelId(EXTRAS_TAB)}-more`
                    }
                    tabIndex={activeTab === EXTRAS_TAB ? 0 : -1}
                    data-testid="category-tab-extras"
                    onClick={() => setActiveTab(EXTRAS_TAB)}
                    className={cn(
                      "flex min-h-11 flex-none snap-start items-center rounded-full px-3.5 text-[12.5px]",
                      "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                      activeTab === EXTRAS_TAB
                        ? "bg-secondary font-semibold text-primary"
                        : "text-muted-foreground"
                    )}
                  >
                    {t("step2.extrasTab")}
                  </button>
                )}
              </div>
              {/* fade: accese solo finché c'è corsa (mockup fades()).
                  `left-3`/`right-3` = il `px-3` del wrapper: la sfumatura sta
                  TUTTA sopra la corsia, non metà nella gronda del pannello. */}
              <span
                aria-hidden
                className={cn(
                  "pointer-events-none absolute inset-y-0 left-3 w-6 bg-gradient-to-r from-card to-transparent transition-opacity",
                  tabFades.left ? "opacity-100" : "opacity-0"
                )}
              />
              <span
                aria-hidden
                className={cn(
                  "pointer-events-none absolute inset-y-0 right-3 w-6 bg-gradient-to-l from-card to-transparent transition-opacity",
                  tabFades.right ? "opacity-100" : "opacity-0"
                )}
              />
            </div>
            {/* the design name lives in the canvas summary in the editor */}
            <div className="max-md:hidden">
              <p className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                {t("stepIndicator", { step: 2 })}
              </p>
              <h2 className="mt-1 text-xl font-semibold">{designName(selected)}</h2>
            </div>

            {/* R4-STEP2: su desktop `md:contents` rende questo wrapper invisibile
                al layout — i figli restano esattamente dove sono oggi, nello
                stesso ordine e con lo stesso `gap-6` del pannello. Sotto md è la
                prima metà del pannello della tab «Detaljer» (la seconda — note e
                scritta — sta in fondo, dove il DOM desktop la vuole). Un solo
                scroller: quello del pannello (Task 3), quindi le due metà
                scorrono insieme, di seguito. */}
            <div
              // hasExtras=false → nessuna tab «Detaljer» esiste (gated sopra
              // sullo stesso flag): id/role/aria-labelledby penzolerebbero su
              // una tab mai renderizzata. Il wrapper resta (i suoi figli sono
              // comunque tutti vuoti in quel caso), solo il plumbing ARIA è
              // gated.
              id={hasExtras ? tabPanelId(EXTRAS_TAB) : undefined}
              role={hasExtras && !isDesktop ? "tabpanel" : undefined}
              aria-labelledby={hasExtras && !isDesktop ? tabId(EXTRAS_TAB) : undefined}
              data-testid="step2-extras"
              className={cn(
                "md:contents",
                "max-md:flex max-md:flex-col max-md:gap-4 max-md:px-1 max-md:py-3",
                activeTab !== EXTRAS_TAB && "max-md:hidden"
              )}
            >
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
            </div>

            {detail.categories.map((cat) => (
              <CategoryLane
                key={cat.id}
                cat={cat}
                label={label(cat)}
                selectedId={selections[cat.slug]}
                active={activeTab === cat.slug}
                isDesktop={isDesktop}
                tabId={tabId(cat.slug)}
                panelId={tabPanelId(cat.slug)}
                onSelect={(optionId) => selectOption(cat.slug, optionId)}
                onKeyDown={(e) => onRadioKeyDown(e, cat)}
                t={t}
              />
            ))}

            {/* R4-STEP2: seconda metà della tab «Detaljer». Stessa tecnica
                `md:contents`; l'id non si ripete (resta unico), ma il ruolo
                tabpanel SÌ — `aria-controls` sulla tab elenca ENTRAMBI questi
                id (sopra), quindi entrambi vanno annunciati come contenuto
                della tab, non solo il primo. */}
            <div
              id={hasExtras ? `${tabPanelId(EXTRAS_TAB)}-more` : undefined}
              role={hasExtras && !isDesktop ? "tabpanel" : undefined}
              aria-labelledby={hasExtras && !isDesktop ? tabId(EXTRAS_TAB) : undefined}
              data-testid="step2-extras-more"
              className={cn(
                "md:contents",
                "max-md:flex max-md:flex-col max-md:gap-4 max-md:px-1 max-md:pb-3",
                activeTab !== EXTRAS_TAB && "max-md:hidden"
              )}
            >
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
            </div>

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
                era il sintomo che AC10 deve chiudere, non una via d'uscita.
                R4-STEP2: quel ripiegamento in colonna vale ORA SOLO da md in su —
                le varianti `@container` sono prefissate `md:` apposta. Sotto md
                l'editor mette i due affiancati (mockup .navB) e AC10 la chiude
                alleggerendo il Next, non troncandolo (vedi sotto). */}
            {/* R4-STEP2 (mockup .navB): in the editor the two CTAs sit SIDE BY
                SIDE at the foot of the panel and never scroll away — sticky to
                the bottom of the panel's own scroll port, on the panel's card
                background. NB: `env(safe-area-inset-bottom)` reads 0 today (the
                app declares no `viewport-fit=cover`, so there is no safe area to
                read) — it is in the padding so the row is already correct the
                day that lands, not because it does something now. */}
            <div
              className="@container max-md:sticky max-md:bottom-0 max-md:z-10 max-md:-mx-3 max-md:mt-auto max-md:flex-none max-md:bg-card max-md:px-3 max-md:pb-[calc(0.5rem+env(safe-area-inset-bottom))] max-md:pt-2"
              data-testid="step-nav-flow"
            >
            <div className="flex flex-col-reverse gap-3 md:@md:flex-row md:@md:items-stretch max-md:flex-row max-md:gap-2.5">
              <NextStepPill
                variant="secondary"
                data-testid="back-step"
                // Stacked (colonna stretta): piena larghezza e contenuto
                // centrato come da mockup. Affiancato: torna largo il minimo
                // e allineato a sinistra, così il Next si prende il resto.
                className="justify-center [&>span]:flex-none md:@md:shrink-0 md:@md:justify-start max-md:shrink-0"
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
                // `@md:` = affiancato: in colonna `flex-basis` sarebbe
                // l'ALTEZZA (16rem di pillola), e stacked non serve comunque
                // (`stretch` fa già piena larghezza).
                // `@max-md:` = AC13, niente ellipsis a 360/390/412: a 360 in
                // inglese l'etichetta chiedeva 144px in 124. Padding, gap
                // interno e freccetta si comprimono SOLO in colonna e
                // restituiscono 16px, le foto (sotto) altri 16 → 8px di
                // margine sul caso peggiore. Comprimere, non troncare.
                // R4-STEP2 / AC10: affiancato al Back sotto md il Next ha
                // ~190px a 360 — con caption, etichetta lunga e tre foto
                // «Choose ceramics» si troncava (misurato in Chromium: EN@360
                // labelClipped=true). Nell'editor la pillola diventa quella del
                // mockup (.navB): SOLO «Neste steg ›». Quindi sotto md sparisce
                // VISIVAMENTE l'ETICHETTA lunga (`data-pill-label`) e resta la
                // CAPTION, che prende la taglia da CTA (15px semibold, niente
                // maiuscoletto).
                // Ruling finale (rivede quello precedente): `sr-only`, non
                // `hidden` — così il nome accessibile resta «Choose ceramics»/
                // «Velg keramikk» (la destinazione vera) invece di ridursi a
                // «Next step». `sr-only` è `position:absolute`: come `hidden`
                // non occupa larghezza né genera gap nel flex, quindi il costo
                // visivo è zero. Da md in su non cambia nulla: caption sopra,
                // etichetta lunga sotto, foto, freccetta.
                // Le varianti `@container` sono `md:`-prefissate: sotto md non
                // competono più con queste.
                className="md:@max-md:gap-2.5 md:@max-md:p-2.5 md:@max-md:[&>span:last-child]:size-8 md:@md:flex-[1_1_16rem] max-md:flex-1 max-md:[&_[data-pill-label]]:sr-only max-md:[&_[data-pill-caption]]:text-[15px] max-md:[&_[data-pill-caption]]:font-semibold max-md:[&_[data-pill-caption]]:normal-case max-md:[&_[data-pill-caption]]:tracking-normal max-md:[&_[data-pill-caption]]:text-foreground"
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
                    <span
                      className="flex shrink-0 gap-0.5 max-md:hidden @md:gap-1"
                      aria-hidden
                    >
                      {ceramics.map((img) => (
                        // eslint-disable-next-line @next/next/no-img-element -- catalog art from storage
                        <img
                          key={img}
                          src={assetUrl(img)}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          data-testid="next-step-ceramic-thumb"
                          // AC13: a colonna stretta i quadrati scendono a 28px
                          // (e il loro gap a 2px) — 16px restituiti
                          // all'etichetta, che a 360 in inglese ne mancava 20.
                          // Restano leggibili: sono decorativi (aria-hidden),
                          // il touch target è tutta la pillola.
                          className="size-7 rounded-sm border border-border bg-card object-contain @md:size-9"
                        />
                      ))}
                    </span>
                  ) : (
                    // Fornitore senza foto prodotto: si ricade sull'icona neutra
                    // invece di lasciare la pillola monca.
                    // R4-STEP2: come le foto, il cerchietto di ripiego sparisce
                    // sotto md — l'editor vuole la pillola nuda del mockup.
                    <PillIcon className="max-md:hidden">
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
    </div>
  );
}

/**
 * R4-STEP2 — una categoria dello step 2. Da md in su è il fieldset di sempre
 * (griglia che va a capo, F15: tutte le opzioni a colpo d'occhio). Sotto md è
 * la corsia orizzontale del mockup variante B — snap, peek, numerazione e fade
 * laterali — ed è il tabpanel della sua tab (plumbing ARIA di Task 5, invariato).
 *
 * Vive fuori da `ConfiguratorClient` perché ogni corsia ha il suo `useLaneFades`:
 * un hook non può stare dentro un `.map`.
 */
function CategoryLane({
  cat,
  label,
  selectedId,
  active,
  isDesktop,
  tabId,
  panelId,
  onSelect,
  onKeyDown,
  t,
}: {
  cat: DesignDetail["categories"][number];
  label: string;
  selectedId: string | undefined;
  active: boolean;
  isDesktop: boolean;
  tabId: string;
  panelId: string;
  onSelect: (optionId: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const laneRef = useRef<HTMLDivElement>(null);
  // dep con `active`: al cambio tab la corsia passa da display:none a visibile e
  // le fade vanno ricalcolate SUBITO, non per il rimbalzo del ResizeObserver.
  const fades = useLaneFades(laneRef, `${active}:${cat.id}`);
  const single = cat.options.length === 1;
  // R1-FB1: the selected COLOUR's name doubles the swatch as text (manager +
  // ceramist double check). Catalog proper noun, no i18n. Derived from
  // `selections` (URL params), so click, keyboard, ?code= reloads and
  // sync_group (color-lock) all update it.
  const selectedName =
    cat.kind === "color"
      ? cat.options.find((o) => o.id === selectedId)?.name
      : undefined;
  // mockup `.opts.dense`: oltre le 9 opzioni la corsia va a 2 righe che
  // scorrono insieme, invece di diventare una maratona a una riga sola.
  const dense = cat.options.length > 9;

  // Tab aperta → la scelta corrente dev'essere visibile, altrimenti la corsia
  // riparte da sinistra e sembra che non ci sia nessuna selezione. Solo se la
  // corsia scorre davvero: su desktop (griglia che va a capo) non scorre, quindi
  // qui non succede nulla e la pagina non si muove.
  useEffect(() => {
    const lane = laneRef.current;
    if (!active || !lane || lane.scrollWidth <= lane.clientWidth) return;
    lane
      .querySelector<HTMLElement>('[aria-checked="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active, selectedId]);

  return (
    <fieldset
      // R4-STEP2: sotto md il fieldset È il pannello della sua tab — senza
      // id/role l'`aria-controls` della corsia tab punterebbe nel vuoto e tutte
      // le categorie resterebbero visibili insieme. Da md in su resta il
      // fieldset di sempre (attributi ARIA spenti da `isDesktop`, classi tutte
      // `max-md:`).
      id={panelId}
      role={isDesktop ? undefined : "tabpanel"}
      aria-labelledby={isDesktop ? undefined : tabId}
      data-testid={`category-${cat.slug}`}
      className={cn(
        "min-w-0",
        // colonna a tutta altezza del pannello; `-mx-3` annulla la gronda del
        // pannello così la corsia scorre da bordo a bordo (mockup: `.opts` sta
        // dentro `.panelB`, senza padding intorno) e le fade la coprono tutta.
        // `relative` = riferimento delle fade.
        "max-md:relative max-md:-mx-3 max-md:flex max-md:min-h-0 max-md:flex-1 max-md:flex-col",
        !active && "max-md:hidden"
      )}
    >
      {/* sotto md il nome della categoria è già nella tab attiva e nel riepilogo
          sopra il canvas, e il nome dell'opzione scelta sta sotto il suo
          swatch: la legend diventa `sr-only` ma RESTA nel DOM (screen reader +
          testid `legend-selected`). */}
      <legend className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] max-md:sr-only">
        {label}
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

      {single ? (
        // con una sola opzione non c'è corsia: sotto md la legend è sr-only, e
        // un pannello vuoto sembrerebbe rotto — la nota torna visibile qui.
        <p
          // la legend `sr-only` annuncia già label + `singleOption`: questa è la
          // sua copia visibile, non un secondo contenuto.
          aria-hidden
          className="hidden text-sm text-muted-foreground max-md:block max-md:px-3 max-md:py-3"
        >
          {label} · {t("singleOption")}
        </p>
      ) : cat.kind === "color" ? (
        // F15: da md in su griglia verticale che va a capo — ogni opzione
        // visibile, nessuno scroller orizzontale (supera il carosello F02).
        <div
          ref={laneRef}
          role="radiogroup"
          aria-label={label}
          onKeyDown={onKeyDown}
          data-testid="option-grid"
          className={cn(
            // desktop (F15): invariato
            "flex flex-wrap gap-2.5",
            // mobile (mockup `.opts`): corsia orizzontale con snap e peek
            "max-md:min-h-0 max-md:min-w-0 max-md:flex-1 max-md:items-start max-md:overflow-x-auto max-md:scroll-pl-3 max-md:px-3 max-md:py-3 max-md:snap-x max-md:snap-proximity max-md:[scrollbar-width:none] max-md:[&::-webkit-scrollbar]:hidden",
            dense
              ? // mockup `.opts.dense`: due righe che scorrono insieme
                "max-md:grid max-md:grid-flow-col max-md:grid-rows-2 max-md:justify-start max-md:gap-x-3 max-md:gap-y-2.5"
              : "max-md:flex-nowrap max-md:gap-3"
          )}
        >
          {cat.options.map((o, i) => (
            <div
              key={o.id}
              // `md:contents` = da md in su questo wrapper sparisce dal layout e
              // lo Swatch torna a essere figlio diretto della griglia, esattamente
              // come oggi (desktop invariato al pixel).
              className="md:contents max-md:flex max-md:w-16 max-md:flex-none max-md:snap-start max-md:flex-col max-md:items-center max-md:gap-1"
            >
              <Swatch
                hex={o.hex ?? "#000"}
                name={o.name}
                selected={selectedId === o.id}
                tabIndex={selectedId === o.id ? 0 : -1}
                imageSrc={o.image ? assetUrl(o.image) : undefined}
                previewSrc={o.layerImage ? assetUrl(o.layerImage) : undefined}
                previewAlt={o.name}
                onSelect={() => onSelect(o.id)}
              />
              {/* mockup: «1 · Nome». L'indice è la POSIZIONE 1-based nell'ordine
                  corrente: in catalogo non esiste un codice colore fornitore
                  (`supplier_colors` non ha una colonna codice e `options.code` è
                  il segmento del config-code, ADR 0011, non un codice da
                  mostrare). `aria-hidden`: il nome è già nell'`aria-label` dello
                  Swatch, senza questo lo screen reader lo leggerebbe due volte. */}
              <span
                aria-hidden
                className={cn(
                  "hidden text-center text-[10px] leading-[1.25] max-md:block",
                  selectedId === o.id
                    ? "font-semibold text-foreground"
                    : "text-muted-foreground"
                )}
              >
                <b>{i + 1}</b> · {o.name}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div
          ref={laneRef}
          data-testid="option-grid"
          className={cn(
            // desktop: invariato
            "grid grid-cols-3 gap-2.5 sm:grid-cols-4",
            // mobile: stessa corsia orizzontale delle opzioni colore
            "max-md:flex max-md:min-h-0 max-md:min-w-0 max-md:flex-1 max-md:items-start max-md:gap-3 max-md:overflow-x-auto max-md:scroll-pl-3 max-md:px-3 max-md:py-3 max-md:snap-x max-md:snap-proximity max-md:[scrollbar-width:none] max-md:[&::-webkit-scrollbar]:hidden"
          )}
        >
          {cat.options.map((o) => (
            <OptionCard
              key={o.id}
              label={o.name}
              imageUrl={o.image ? assetUrl(o.image) : undefined}
              selected={selectedId === o.id}
              onSelect={() => onSelect(o.id)}
              className="max-md:w-24 max-md:flex-none max-md:snap-start"
            />
          ))}
        </div>
      )}

      {/* mockup `.lane.can-l`/`.can-r` — solo mobile, solo finché c'è corsa. */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 left-0 z-[2] hidden w-6 bg-gradient-to-r from-card to-transparent transition-opacity max-md:block",
          fades.left ? "opacity-100" : "opacity-0"
        )}
      />
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 right-0 z-[2] hidden w-6 bg-gradient-to-l from-card to-transparent transition-opacity max-md:block",
          fades.right ? "opacity-100" : "opacity-0"
        )}
      />
    </fieldset>
  );
}
