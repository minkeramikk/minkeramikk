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
import {
  findTextGroup,
  isCustomTextOffered,
} from "@/lib/configurator/text-option";
import { useLaneFades } from "@/lib/configurator/use-lane-fades";
import {
  ARROW_SAFE_PX,
  arrowStep,
  centreScrollLeft,
  nearestScrollLeft,
} from "@/lib/configurator/lane-scroll";
import { PreviewCanvas } from "@/components/ui-domain/preview-canvas";
import { Stepper } from "@/components/ui-domain/stepper";
import { Swatch } from "@/components/ui-domain/swatch";
import {
  NextStepPill,
  PillIcon,
  PILL_SM_UNDER_MD,
} from "@/components/ui-domain/next-step-pill";
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
import { keyboardSafeScrollDelta } from "@/lib/configurator/keyboard-safe-scroll";
import { MAX_CUSTOM_TEXT } from "@/lib/orders/schema";
import { cn } from "@/lib/utils";
import type { DesignDetail } from "@/lib/catalog/design-options";
import type { PreviewLayer } from "@/lib/configurator/preview";

/** Pagina di ispirazione del cliente (fuori sito, apre in nuova scheda). */
const INSPIRATION_URL = "https://www.minkeramikk.no/inspirasjon";

/** R4-POLISH voce 3: tab dei «Fargeønsker» — valgt figur, complementære /
 *  jeg velger selv, note, e (senza gruppo «Tekst») il campo scritta. Non è una
 *  categoria di catalogo, quindi ha una chiave sintetica; costante di modulo,
 *  identità stabile fra i render. */
const WISHES_TAB = "__wishes";

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
 * R4-STEP2-KEYBOARD ② — porta il campo sopra la tastiera, in due tempi.
 *
 * Prima il LAYOUT, poi lo scroll. `setTyping(true)` fa mollare lo sticky al
 * canvas e alla barra tab: misurare nello stesso tick significa leggere un rect
 * che il paint successivo invalida — è così che il campo finiva «alto». Due
 * `requestAnimationFrame` aspettano quel commit, poi `scrollIntoView` centra il
 * campo rispettando il suo `scroll-margin-top`: niente più delta calcolato a
 * mano, e nessuno `scrollBy` che compete con lo scroll nativo del focus.
 *
 * Con ① (`interactive-widget=resizes-content`) il viewport di layout si
 * restringe da solo e questo basta. Resta la CORREZIONE per iOS, che quello non
 * lo supporta: al `resize` del viewport visuale — l'unico momento in cui si sa
 * quanto schermo è rimasto — si ricontrolla, e si scorre solo se serve
 * davvero. Nessun timer: se la tastiera non alza nulla, non si tocca niente.
 * L'aritmetica sta in lib/configurator/keyboard-safe-scroll, coi suoi unit.
 */
function keepClearOfKeyboard(field: HTMLElement) {
  const frame = () => {
    if (!field.isConnected) return;
    field.scrollIntoView({ block: "center", behavior: "smooth" });
  };
  requestAnimationFrame(() => requestAnimationFrame(frame));

  const vv = window.visualViewport;
  if (!vv) return;
  vv.addEventListener(
    "resize",
    () => {
      const box = field.getBoundingClientRect();
      // il campo può essere sparito (blur → pannello max-md:hidden) o staccato
      // dal DOM (avanzato allo step 3) prima che il resize arrivi: un rect
      // azzerato produrrebbe uno scroll fantasma, quindi si abortisce qui.
      if (!field.isConnected || !box.height) return;
      const styles = getComputedStyle(field);
      const delta = keyboardSafeScrollDelta({
        fieldTop: box.top,
        fieldBottom: box.bottom,
        viewportTop: vv.offsetTop,
        viewportHeight: vv.height,
        // il canvas ha già mollato lo sticky (`data-typing`), quindi in alto
        // resta solo l'header ink: lo `scroll-margin-top` del campo lo riflette
        marginTop: parseFloat(styles.scrollMarginTop) || 0,
        marginBottom: 12,
      });
      if (delta !== 0) window.scrollBy({ top: delta, behavior: "smooth" });
    },
    { once: true }
  );
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
  /** R4-RESTYLE: la corsia tab è fatta SOLO di gruppi-opzione — «Detaljer» e
   *  «Bilder» non esistono più (i loro contenuti sono in pagina, sopra il
   *  pannello). Quindi la tab attiva è sempre lo slug di una categoria. */
  const [activeTab, setActiveTab] = useState<string>(
    detail.categories[0]?.slug ?? ""
  );
  // design nuovo = categorie nuove: la tab attiva torna alla prima.
  useEffect(() => {
    setActiveTab(detail.categories[0]?.slug ?? "");
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
  /** F36: testo descrittivo dello step 2. R4-RESTYLE: sotto md sta SOPRA il
   *  canvas (scorre via), su desktop resta in cima al pannello. */
  const step2Description =
    locale === "no" ? detail.descriptionStep2No : detail.descriptionStep2En;

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

  /** R4-POLISH voce 8: mentre si scrive, il canvas molla lo `sticky`. Con la
   *  tastiera aperta il viewport visuale scende a ~300px e header + canvas ne
   *  occupano ~293: senza questo il campo non ha DOVE stare, e nessuno scroll
   *  può rimediare. Chi digita sta leggendo ciò che scrive, non il piatto. */
  const [typing, setTyping] = useState(false);

  /** R4-STEP2-KEYBOARD ③: col campo a fuoco la riga nav è agganciata al fondo,
   *  e il blur la rimette in flusso — cioè la sposta via da sotto il dito, tra
   *  il mousedown e il click. Prevenire il default del mousedown è ciò che
   *  impedisce quel blur: il tap su «Neste» prende al primo colpo. Solo mentre
   *  si scrive: fuori di lì il focus del bottone deve funzionare come sempre. */
  const keepFocusWhileTyping = typing
    ? (e: React.MouseEvent<HTMLButtonElement>) => e.preventDefault()
    : undefined;

  // Reset when the selected design changes (per-design field).
  useEffect(() => {
    setCustomText(new URLSearchParams(searchParams.toString()).get("text") ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key on design only
  }, [selected.slug]);

  // Focus the textarea when "I'll choose" is selected (AC3, also for SR users).
  // preventScroll resta: il blocco note sta in fondo al pannello e uno
  // scroll-into-view del browser porterebbe via il canvas sticky senza che
  // l'utente abbia chiesto niente.
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

  // R4-FIX 8: il campo scritta è governato dal gruppo «Tekst» — euristica sui
  // nomi + fallback storico, con i suoi unit test, in lib/configurator/text-option.
  const textCategory = useMemo(
    () => findTextGroup(detail.categories),
    [detail]
  );
  const showCustomText = isCustomTextOffered({
    acceptsCustomText: detail.acceptsCustomText,
    textGroup: textCategory,
    selectedOptionId: textCategory ? selections[textCategory.slug] : undefined,
  });

  /* R4-COPY Ⓒ (chiusa) + R4-FIX 7: la didascalia col link alla
     inspirasjonsside. `t.rich` rende il tag <link> del dizionario — nessun HTML
     crudo nei JSON, nessun testo duplicato: lo stesso nodo va sotto il canvas
     (desktop) e in coda al pane «Detaljer» (editor mobile). Nuova scheda: dal
     configuratore non si esce mai. */
  const previewNote = t.rich("previewNote", {
    link: (chunks) => (
      <a
        href={INSPIRATION_URL}
        target="_blank"
        rel="noopener noreferrer"
        data-testid="preview-note-link"
        className="rounded-sm text-primary underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {chunks}
      </a>
    ),
  });

  /* F38 — campo scritta. R4-FIX 10: niente placeholder (titolo + helper
     bastano). R4-POLISH voci 2+8: sul focus il campo si porta sopra la
     tastiera con `keepClearOfKeyboard` (viewport visuale, non di layout) e il
     canvas molla lo `sticky` (`typing`), altrimenti non c'è striscia libera in
     cui stare — vedi Controller Ruling 3 nel task. */
  const customTextField = (
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
        maxLength={MAX_CUSTOM_TEXT}
        onChange={(e) => setCustomText(e.target.value)}
        onFocus={(e) => {
          setTyping(true);
          keepClearOfKeyboard(e.currentTarget);
        }}
        onBlur={() => setTyping(false)}
        aria-label={t("customText.title")}
        aria-describedby="custom-text-helper"
        className="w-full rounded-sm border border-input bg-card p-2 text-base focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring md:text-sm max-md:scroll-mt-14"
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
          {t("customText.counter", { count: customText.length, max: MAX_CUSTOM_TEXT })}
        </span>
      </div>
    </section>
  );

  // ── R4-STEP2: corsia tab del pannello mobile ──────────────────────────────
  const tabsRef = useRef<HTMLDivElement>(null);
  const tabFades = useLaneFades(
    tabsRef,
    `${selected.slug}:${detail.categories.length}`
  );
  const tabId = (key: string) => `step2-tab-${key}`;
  const tabPanelId = (key: string) => `step2-panel-${key}`;
  /** R4-FIX 9 (giro precedente): frecce ‹ › sulla barra tab, stesso gesto delle
   *  corsie foto — 70% della corsia per tocco. */
  const scrollTabs = (dir: -1 | 1) => {
    const el = tabsRef.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.7, behavior: "smooth" });
  };
  /* R4-ARROWS: il tab ATTIVO non deve mai riposare sotto un disco freccia.
     `scroll-px-11` copre snap e focus-into-view, ma NON il tap: cliccare un tab
     non lo scrolla, quindi restava dov'era — anche mezzo coperto. Qui lo si
     porta dentro la fascia libera, e SOLO se serve (`nearestScrollLeft` è un
     `inline:"nearest"`: se il tab ci sta già, non muove niente).
     Si scrive `scrollLeft`, non `scrollIntoView`: quello scrollerebbe anche la
     pagina, ed è il bug che R4-POLISH voce 5 ha appena chiuso. */
  useEffect(() => {
    const el = tabsRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    const tab = el.querySelector<HTMLElement>(
      "[data-testid^='category-tab-'][aria-selected='true']"
    );
    if (!tab) return;
    const box = tab.getBoundingClientRect();
    if (!box.width) return;
    const next = nearestScrollLeft({
      scrollerLeft: el.getBoundingClientRect().left,
      scrollLeft: el.scrollLeft,
      clientWidth: el.clientWidth,
      targetLeft: box.left,
      targetWidth: box.width,
      padStart: ARROW_SAFE_PX,
      padEnd: ARROW_SAFE_PX,
    });
    if (next !== el.scrollLeft) el.scrollTo({ left: next, behavior: "smooth" });
  }, [activeTab, isDesktop]);
  /** Foto reali del design: R4-RESTYLE le porta nella sezione
   *  «Inspirasjonsbilder», in pagina sotto la didascalia del canvas. */
  const hasImages = hasPhotos(detail.images);
  /** Blocchi che restano nel pannello anche sotto md (il tab «Detaljer» non
   *  esiste più): lås farger, note colore e — senza gruppo «Tekst» — il campo
   *  scritta. Nessuno dei tre attivo → niente blocco, niente gronda vuota. */
  const hasPanelExtras =
    hasSyncGroup || detail.acceptsCustomNotes || (!textCategory && showCustomText);

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
    // F38: carry the inscription forward only when the design accepts it and
    // the field is actually offered (R4-FIX 8: chi torna su «nessun testo» non
    // deve portarsi dietro la scritta digitata prima).
    if (showCustomText && customText.trim()) {
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
    // R4-RESTYLE: no `data-editor` hook and no height chain — the globals.css
    // block that locked the viewport is gone. Under md step 2 is an ordinary
    // page scroller whose canvas is `position: sticky`.
    <div data-testid="configurator">
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
        className={cn("mb-4", step === 2 && "max-md:mb-3")}
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
          // R4-RESTYLE: at step 2 under md this container is the vertical
          // scroller of the client's sketch — description, canvas (sticky),
          // caption, inspiration photos, heading, tool panel — a plain flex
          // column with zero gap (each block carries its own margin) and the
          // sticky canvas's containing block, so the canvas stays put for the
          // WHOLE column. From md up NOTHING changes: the mobile-only blocks
          // are `md:hidden`, so they are not grid items at all.
          // `items-stretch` cancels the grid's `items-start` ONLY here: as a
          // flex column that would shrink-to-fit every child, so a horizontal
          // lane's max-content (a long tab row, a wide option lane) blew the
          // panel out to 1524px inside a 390px viewport.
          // R4-POLISH voce 8: `data-typing` (set while the inscription field
          // has focus) releases the preview column's sticky positioning —
          // see Controller Ruling 3 in the task brief: with the keyboard up
          // the visual viewport is ~300px and header+canvas already occupy
          // ~293 of it, so there is nowhere left to scroll the field into
          // unless the canvas stops being sticky.
          // R4-FOLLOWUPS Ⓒ: la barra tab è sticky SOTTO il canvas, quindi il
          // suo aggancio dipende dal canvas: quando il canvas molla, molla
          // anche lei. Scelta fra le due del brief (seguire il canvas vs
          // agganciarsi all'header): SEGUE IL CANVAS. Agganciata all'header
          // resterebbe a 56px con ~50px di altezza, cioè esattamente sopra la
          // striscia in cui `keepClearOfKeyboard` porta il campo scritta (il
          // suo `scroll-mt-14` è l'header e basta) — coprirebbe ciò che si sta
          // scrivendo. Da ferma non serve a nulla: con la tastiera aperta si
          // scrive, non si cambia tab.
          // R4-STEP2-KEYBOARD ③: `group/step2` — la riga nav reagisce a
          // `data-typing` dalle SUE classi (sotto), invece di aggiungere qui un
          // quarto selettore discendente.
          step === 2 && "group/step2",
          step === 2 &&
            "max-md:flex max-md:flex-col max-md:items-stretch max-md:gap-0 max-md:data-[typing=1]:[&>[data-preview-column]]:static max-md:data-[typing=1]:[&_[data-tabs-bar]]:static"
        )}
        data-typing={step === 2 && typing ? "1" : undefined}
        style={
          step === 2
            ? ({ "--mk-canvas-h": "clamp(200px,38svh,300px)" } as React.CSSProperties)
            : undefined
        }
      >
        {/* R4-STEP2-HEAD: la testata dello step (occhiello + titolo) è ora
            visibile a OGNI viewport, come allo step 3. Sotto md vive QUI, in
            flusso e SOPRA il canvas: il canvas ha un'altezza fissa
            (`--mk-canvas-h`), un titolo al suo interno gliela mangerebbe —
            fuori, scorre via col resto e il canvas sticky non cambia di un
            pixel. Su desktop il nodo gemello sta in cima al pannello
            (`md:hidden` qui, `max-md:hidden` là): un solo nodo visibile per
            volta, mai due — stessa regola della descrizione qui sotto.
            `mb-4` come allo step 3: qui il contenitore è `max-md:gap-0`, la
            spaziatura la deve mettere il titolo. Il gemello desktop invece NON
            lo porta — il pannello è `flex flex-col gap-6` e sommare i due
            farebbe 40px sotto una testata. */}
        {step === 2 && (
          <div data-testid="step2-heading-mobile" className="md:hidden">
            <p className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
              {t("stepIndicator", { step: 2 })}
            </p>
            <h2 className="mb-4 mt-1 text-xl font-semibold">
              {t("step2.titleDetails")}
            </h2>
          </div>
        )}

        {/* R4-RESTYLE (a): la descrizione del design apre la pagina, SOPRA il
            canvas — scorre via com'è nello sketch del cliente. Su desktop resta
            dov'era, in cima al pannello (`md:hidden` qui, `max-md:hidden` là):
            un solo nodo visibile per volta, mai due. */}
        {step === 2 && step2Description && (
          <div data-testid="step2-description" className="mb-3 md:hidden">
            <DesignDescription text={step2Description} />
          </div>
        )}

        {/* LEFT: the persistent preview — never remounts across steps (AC2).
            F15: sticky so it stays visible while the option list scrolls; on
            mobile it pins to the top.
            CA-7 (variant B): on mobile STEP 1 only, this column drops BELOW the
            design grid (max-md:order-last) and the hero shrinks to a compact
            "Valgt: {name}" confirmation — design-first browsing. Same
            PreviewCanvas instance, toggled purely via CSS (order + width), never
            remounted. Desktop and steps 2–3 are unchanged. */}
        <div
          data-preview-column
          className={cn(
            "z-30 flex min-w-0 flex-col gap-3 md:sticky md:top-4 md:self-start",
            // CA-7 (variant B): design-first on mobile step 1 — the hero is
            // hidden entirely (the design cards double as the preview). It stays
            // MOUNTED (display:none only) so the same PreviewCanvas instance
            // comes back full-size from step 2 with no remount (F14). Desktop
            // and steps 2–3 are unchanged.
            step === 1 && "max-md:hidden",
            // R4-RESTYLE (b) — the NON-NEGOTIABLE of the client's sketch: the
            // canvas is STICKY, everything else scrolls under it. Plain
            // `position: sticky` inside the step-2 column (which spans
            // description → panel), so it holds for the whole page: no JS, no
            // IntersectionObserver, no locked viewport.
            // Height: a clamp, not a flex ratio — there is no shared height to
            // divide any more. `svh` is the SMALLEST viewport (mobile toolbars
            // expanded), so the box never reflows when they collapse (B4).
            // Full-bleed (`-mx-5` against `main`'s `px-5`) so the text scrolling
            // underneath never peeks at the gutters.
            // R4-CANVAS-WHITE: il fondo è `--mk-canvas`, non più il radial
            // caldo. Il gradiente sfumava in `--background` proprio dove cade
            // la fascia esterna del piatto, e i 5 layer `multiply` ci si
            // moltiplicavano sopra: lo swatch scelto arrivava a schermo con
            // Δ 17-32 dal suo hex. Il bianco lo mette QUESTO contenitore (il
            // frame resta `bg-transparent`, sotto), così è una campitura sola
            // a tutta larghezza senza bande. La hairline `border-b` non è
            // decorazione: la box è sticky e il contenuto le scorre sotto,
            // senza bordo il bianco si fonde con la prima card. Costo
            // verticale 0 — `box-sizing: border-box` la tiene dentro
            // `--mk-canvas-h`.
            // `top-14` = the ink header's `h-14`, which is itself `max-md:sticky
            // top-0` (site-header.tsx): the canvas parks UNDER it, not behind it.
            // R4-POLISH: l'altezza del canvas è pubblicata come `--mk-canvas-h`
            // sul contenitore per essere fonte unica SOLO per questa classe
            // (che la consuma per lo `h-[...]` sopra). Il campo scritta NON la
            // usa: il suo `max-md:scroll-mt-14` (sotto) è l'altezza del solo
            // header ink, apposta senza il canvas — quando il campo ha il
            // focus il canvas ha già mollato lo sticky (`data-typing`), quindi
            // in alto non resta altro che l'header.
            step === 2 &&
              "max-md:sticky max-md:top-14 max-md:-mx-5 max-md:h-[var(--mk-canvas-h)] max-md:flex-none max-md:items-center max-md:justify-center max-md:gap-1 max-md:px-5 max-md:pt-2 max-md:border-b max-md:border-border max-md:bg-[var(--mk-canvas)]"
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
              // `[&_p]:hidden` kills the long caption (its only <p>); la
              // didascalia mobile col link vive fuori da questo wrapper
              // (`preview-note-mobile`) ed è intatta.
              step === 2 &&
                "max-md:flex max-md:min-h-0 max-md:flex-1 max-md:items-center max-md:justify-center max-md:[&_[data-canvas-frame]]:h-full max-md:[&_[data-canvas-frame]]:w-full max-md:[&_[data-canvas-frame]]:max-w-none max-md:[&_[data-canvas-frame]]:bg-transparent max-md:[&_[data-canvas-frame]]:shadow-none max-md:[&_p]:hidden"
            )}
          >
            {/* R4-COPY Ⓒ (chiusa): la didascalia ora porta il link alla
                inspirasjonsside. `t.rich` rende il tag <link> del dizionario —
                nessun HTML crudo nei JSON. Nuova scheda: dal configuratore non
                si esce mai. */}
            <PreviewCanvas
              alt={designName(selected)}
              caption={previewNote}
              className={cn(step === 2 && "max-md:contents")}
              layers={previewLayers}
            />
          </div>
          {/* R4-FOLLOWUPS Ⓓ: qui stava la riga-riassunto (mockup .sum), una
              riga sola troncata con «design · categoria: opzione · …». Rimossa:
              a 390px si troncava quasi subito, e ciò che restava leggibile lo
              dicono già i dot e il conteggio delle tab qui sotto. Solo mobile —
              era `max-md:block`, quindi il desktop non cambia di un pixel. */}
        </div>

        {/* R4-RESTYLE (c): la didascalia col link alla inspirasjonsside — sotto
            il canvas e SCORRE VIA (il canvas resta). Stesso nodo `t.rich` della
            caption desktop, che sotto md è spenta dentro `PreviewCanvas`. */}
        {step === 2 && (
          <p
            data-testid="preview-note-mobile"
            className="mt-2.5 text-xs italic text-muted-foreground md:hidden"
          >
            {previewNote}
          </p>
        )}

        {/* R4-RESTYLE (d): «Inspirasjonsbilder» — le foto REALI del design, in
            carosello orizzontale con frecce ‹ › ai bordi (stesso stato
            can-l/can-r delle fade) e lightbox condiviso. Design senza foto →
            sezione assente, non un riquadro vuoto. */}
        {step === 2 && hasImages && (
          <section
            data-testid="step2-inspiration"
            aria-labelledby="step2-inspiration-heading"
            className="mt-5 md:hidden"
          >
            <h2
              id="step2-inspiration-heading"
              className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em]"
            >
              {/* TODO:nb-review — step2.inspirationPhotos */}
              {t("step2.inspirationPhotos")}
            </h2>
            <DesignPhotoStrip images={detail.images} alt={designName(selected)} />
          </section>
        )}

        {/* R4-RESTYLE (e): il titolo che apre la sezione strumenti. */}
        {step === 2 && (
          <h2
            data-testid="step2-configure-heading"
            className="mt-6 mb-2 text-base font-semibold md:hidden"
          >
            {/* TODO:nb-review — step2.configureHeading */}
            {t("step2.configureHeading")}
          </h2>
        )}

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
              // top corners, border and shadow from the tokens.
              // B1 stays law: the panel is NEVER a vertical scroller — a
              // horizontal swipe on a lane must not drag it. R4-RESTYLE makes
              // that trivial: the panel is now a plain content-height block in
              // the page's own scroller, so there is no height to divide, no
              // `flex-1` and no `overflow` anywhere on it.
              // R4-STEP2-SHEET: sotto md il pannello è la stessa campitura del
              // canvas (`--mk-canvas`), non `bg-card` — è il foglio su cui il
              // cliente lavora, e il foglio è bianco come la ceramica,
              // indipendente dal tema. `-mb-7` cancella il `pb-7` del `<main>`
              // (public-shell.tsx, `py-7`): era quello a lasciare 28px di crema
              // fra la riga nav e il footer. Il margine negativo fa uscire il
              // bordo del pannello dal content box del main esattamente di quei
              // 28px, quindi il bianco arriva al footer senza toccare la shell,
              // che è condivisa da ogni pagina pubblica. La separazione dal
              // footer la fa il `border-t` che il footer ha già
              // (site-footer.tsx): nessuna hairline in più, sarebbero due.
              "max-md:-mx-5 max-md:-mb-7 max-md:gap-0 max-md:rounded-t-[var(--radius)] max-md:border-t-[1.5px] max-md:border-border max-md:bg-[var(--mk-canvas)] max-md:px-3 max-md:pt-1 max-md:shadow-[0_-6px_18px_color-mix(in_oklab,var(--mk-dark)_8%,transparent)]"
            )}
            data-testid="details-step"
            data-color-lock={colorLock ? "1" : "0"}
          >
            {/* R4-FIX 1: nessun trattino in testa al pannello. Non trascinava
                niente — affordance falsa, rimossa. */}
            {/* R4-STEP2 (mockup .cats): corsia tab orizzontale — solo mobile.
                Dot = colore selezionato della categoria, conteggio = opzioni.
                I ruoli tab esistono solo dove esiste la corsia (isDesktop).
                B1: il pannello non scorre in verticale, scorre la PAGINA —
                per questo la corsia è sticky contro il viewport (voce Ⓒ qui
                sotto), non contro un porto di scroll del pannello.
                R4-RESTYLE: la corsia è fatta SOLO di gruppi-opzione (Tekst
                compreso) — «Bilder» e «Detaljer» non sono più tab.
                // TODO:nb-review — step2.tabsLabel / step2.tabCount /
                step2.scrollTabsBack / step2.scrollTabsForward */}
            {/* R4-FIX 5 (causa vera): senza `relative` le fade qui sotto sono
                `absolute inset-y-0` contro il BLOCCO CONTENITORE INIZIALE — cioè
                due colonne sfumate alte quanto la pagina, sopra il testo: le
                prime lettere delle frasi a sinistra risultavano sbiadite. Il
                riferimento è questo wrapper, e nient'altro. */}
            {/* R4-FOLLOWUPS Ⓒ: la barra è STICKY subito sotto il canvas
                (`top` = header 3.5rem + `--mk-canvas-h`, la stessa variabile che
                dà l'altezza al canvas), su fondo `card` e sopra il contenuto
                del pannello (`z-20`, sotto il canvas che è `z-30`). Così i
                titoli delle categorie restano raggiungibili anche a pagina
                scrollata in fondo, senza tornare su. `sticky` sostituisce
                `relative`: è comunque un elemento posizionato, quindi le fade
                `absolute` qui sotto continuano a risolversi su questo wrapper
                (R4-FIX 5) — e il wrapper è `md:hidden`, non esiste da md in su. */}
            <div
              data-tabs-bar
              className="sticky top-[calc(3.5rem+var(--mk-canvas-h))] z-20 -mx-3 flex-none bg-[var(--mk-canvas)] px-3 md:hidden"
            >
              <div
                ref={tabsRef}
                role={isDesktop ? undefined : "tablist"}
                aria-label={isDesktop ? undefined : t("step2.tabsLabel")}
                aria-orientation={isDesktop ? undefined : "horizontal"}
                onKeyDown={onTabsKeyDown}
                data-testid="category-tabs"
                // B1: `touch-pan-x` dice al browser che qui il gesto è
                // orizzontale (niente pan verticale rubato), `overscroll-x-contain`
                // impedisce che il fine corsa si propaghi all'antenato.
                // R4-ARROWS: `scroll-px-11` = 44px, la larghezza del disco
                // freccia più la sua area toccabile. È scroll-padding, non
                // padding: non sposta niente, dice solo a snap e all'auto-scroll
                // DOVE fermarsi, così un tab non RIPOSA mai sotto un disco.
                // Passarci sotto DURANTE lo scorrimento resta com'è: è il
                // segnale che c'è dell'altro.
                className="flex touch-pan-x snap-x snap-proximity gap-1 overflow-x-auto overscroll-x-contain scroll-smooth scroll-px-11 px-1 pb-0.5 pt-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
                        // `scroll-mx-1`: la stessa gronda di 4px che la corsia
                        // ha già (`px-1`/`gap-1`), così il punto di riposo
                        // eredita il ritmo della barra invece di incollarsi al
                        // bordo della fascia libera.
                        "flex min-h-11 flex-none snap-start scroll-mx-1 items-center gap-2 rounded-full px-3.5 text-[12.5px]",
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
                {/* R4-POLISH voce 3: in coda, e SOLO se il design ha davvero
                    qualcosa da metterci. Senza contatore (richiesta cliente):
                    non sono opzioni da contare. */}
                {hasPanelExtras && (
                  <button
                    type="button"
                    id={tabId(WISHES_TAB)}
                    role={isDesktop ? undefined : "tab"}
                    aria-selected={isDesktop ? undefined : activeTab === WISHES_TAB}
                    aria-controls={isDesktop ? undefined : tabPanelId(WISHES_TAB)}
                    tabIndex={activeTab === WISHES_TAB ? 0 : -1}
                    data-testid="category-tab-wishes"
                    onClick={() => setActiveTab(WISHES_TAB)}
                    className={cn(
                      "flex min-h-11 flex-none snap-start scroll-mx-1 items-center rounded-full px-3.5 text-[12.5px]",
                      "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                      activeTab === WISHES_TAB
                        ? "bg-secondary font-semibold text-primary"
                        : "text-muted-foreground"
                    )}
                  >
                    {/* TODO:nb-review — step2.wishesTab */}
                    {t("step2.wishesTab")}
                  </button>
                )}
              </div>
              {/* fade: accese solo finché c'è corsa (mockup fades()).
                  `left-3`/`right-3` = il `px-3` del wrapper: la sfumatura sta
                  TUTTA sopra la corsia, non metà nella gronda del pannello. */}
              <span
                aria-hidden
                className={cn(
                  "pointer-events-none absolute inset-y-0 left-3 w-6 bg-gradient-to-r from-[var(--mk-canvas)] to-transparent transition-opacity",
                  tabFades.left ? "opacity-100" : "opacity-0"
                )}
              />
              <span
                aria-hidden
                className={cn(
                  "pointer-events-none absolute inset-y-0 right-3 w-6 bg-gradient-to-l from-[var(--mk-canvas)] to-transparent transition-opacity",
                  tabFades.right ? "opacity-100" : "opacity-0"
                )}
              />
              {/* frecce ‹ ›: stesso stato can-scroll delle fade, quindi appaiono
                  solo quando c'è davvero corsa. `hidden` (l'attributo, non la
                  classe) le toglie anche dal tab order. Disco 36px + il pseudo
                  `after` (2×4px) = 44px di area toccabile (§5). */}
              <button
                type="button"
                onClick={() => scrollTabs(-1)}
                aria-label={t("step2.scrollTabsBack")}
                data-testid="category-tabs-prev"
                hidden={!tabFades.left}
                className="absolute top-1/2 left-1 z-2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--mk-canvas)] text-sm ring-1 ring-border after:absolute after:-inset-1 after:content-[''] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => scrollTabs(1)}
                aria-label={t("step2.scrollTabsForward")}
                data-testid="category-tabs-next"
                hidden={!tabFades.right}
                className="absolute top-1/2 right-1 z-2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--mk-canvas)] text-sm ring-1 ring-border after:absolute after:-inset-1 after:content-[''] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                ›
              </button>
            </div>
            {/* R4-STEP2-HEAD: l'h2 è un TITOLO DI STEP («Velg detaljer»), come
                allo step 3 — non più il nome del design. Il gemello sotto md sta
                sopra il canvas, quindi qui resta `max-md:hidden`: un solo nodo
                visibile per volta.
                Ⓓ resta rispettato — il nome del design NON torna nell'editor
                mobile. Su desktop però, tolto dall'h2, non comparirebbe più da
                nessuna parte in questa colonna (allo step 2 vive solo come
                `alt` della preview), quindi scende a riga piccola qui sotto:
                questo blocco è già desktop-only. */}
            <div className="max-md:hidden">
              <p className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                {t("stepIndicator", { step: 2 })}
              </p>
              <h2 className="mt-1 text-xl font-semibold">{t("step2.titleDetails")}</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {designName(selected)}
              </p>
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
                // R4-FIX 9: il campo scritta vive SOTTO il suo gruppo — dentro
                // il tab Tekst su mobile, sotto il fieldset Tekst su desktop.
                footer={
                  textCategory?.id === cat.id && showCustomText
                    ? customTextField
                    : null
                }
              />
            ))}

            {/* R4-POLISH voce 3: il pannello del tab «Fargeønsker». Su desktop
                `md:contents` lo toglie dal layout e i figli tornano figli
                diretti del pannello col suo `gap-6` e l'ordine di sempre
                (`md:order-*`) — desktop invariato. Sotto md raccoglie ciò che
                non è un gruppo-opzione: lås farger, note colore con «valgt
                figur», e — senza gruppo «Tekst» — il campo scritta.
                Niente `overflow`: il pannello non scorre, scorre la pagina (B1). */}
            <div
              id={tabPanelId(WISHES_TAB)}
              role={isDesktop ? undefined : "tabpanel"}
              aria-labelledby={isDesktop ? undefined : tabId(WISHES_TAB)}
              data-testid="step2-extras"
              className={cn(
                "md:contents",
                "max-md:flex max-md:flex-col max-md:gap-4 max-md:px-1 max-md:pt-3",
                // R4-POLISH voce 3: sotto md non è più in fondo al pannello ma
                // DIETRO il suo tab. Doppia guardia: niente contenuti → niente
                // tab e niente pannello; tab non attiva → nascosto.
                (!hasPanelExtras || activeTab !== WISHES_TAB) && "max-md:hidden"
              )}
            >
              {/* F36: design description (per-locale) — no text, no block.
                  R4-RESTYLE: sotto md la descrizione apre la PAGINA, sopra il
                  canvas; qui resta il solo nodo desktop. */}
              {step2Description && (
                <div className="max-md:hidden md:order-1">
                  <DesignDescription text={step2Description} />
                </div>
              )}
              {/* F36: real-photo filmstrip — no images, no strip, no placeholder.
                  R4-RESTYLE: sotto md le foto sono la sezione
                  «Inspirasjonsbilder» in pagina, quindi qui è desktop-only e non
                  si duplica. */}
              {hasImages && (
                <div className="max-md:hidden md:order-1">
                  <DesignPhotoStrip
                    images={detail.images}
                    alt={designName(selected)}
                  />
                </div>
              )}

              {hasSyncGroup && (
                <label className="flex items-center gap-2.5 text-sm md:order-1">
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
              {/* R2-2b: custom colour note block — only when the design supports it (AC2).
                  The note lives in state + URL param only; it never enters selections or
                  previewLayers (AC3, no-preview-mutation invariant). */}
              {detail.acceptsCustomNotes && (
                <section
                  data-testid="custom-notes"
                  className="rounded-sm border border-border bg-card/40 p-4 md:order-3"
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

              {/* R4-FIX 8, fallback: design senza gruppo «Tekst» (oggi tutti,
                  finché il cliente non lo crea) → il campo resta dov'era, in
                  fondo al pane, col comportamento storico. */}
              {!textCategory && showCustomText && (
                <div className="md:order-3">{customTextField}</div>
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
            {/* R4-STEP2 (mockup .navB): under md the two CTAs sit SIDE BY SIDE
                at the foot of the panel, on the panel's card background.
                R4-RESTYLE: NOT sticky. It was tried and reverted with evidence:
                a `sticky bottom-0` row is a fixed bar until it reaches its flow
                position, so with the page continuing below the fold it sat ON
                TOP of the option lane and hid the swatches at first paint
                (docs/evidence/r4-step2-restyle). There is no CSS that keeps a
                bottom-sticky bar off the content above it. Since the panel is
                the LAST block of the page, the row in normal flow is one short
                scroll away and never covers anything.
                NB: `env(safe-area-inset-bottom)` reads 0 today (the app declares
                no `viewport-fit=cover`, so there is no safe area to read) — it
                is in the padding so the row is already correct the day that
                lands, not because it does something now. */}
            <div
              // R4-STEP2-SHEET: sotto md la riga nav è dentro il foglio, non una
              // barra a sé — stessa campitura `--mk-canvas` del canvas e del
              // pannello. Il `pb-[calc(0.75rem+env(safe-area-inset-bottom))]`
              // resta: è spazio INTERNO al foglio, non la striscia crema.
              // R4-STEP2-KEYBOARD ③: mentre si scrive (e SOLO allora, sotto md)
              // la riga si aggancia al fondo. Con ① il fondo del viewport di
              // layout è il bordo alto della tastiera, quindi Back/Next stanno
              // sopra i tasti invece di finirci sotto. Chiusa la tastiera torna
              // in flusso: il foglio dello step 2 (R4-STEP2-SHEET) non cambia
              // di un pixel, ed è ciò che teneva la riga fuori dalla corsia
              // opzioni al primo paint. Campitura e safe-area ci sono già; la
              // hairline serve solo da agganciata, sul contenuto che le scorre
              // sotto.
              className="@container md:order-4 max-md:z-10 max-md:-mx-3 max-md:mt-3 max-md:bg-[var(--mk-canvas)] max-md:px-3 max-md:pb-[calc(0.75rem+env(safe-area-inset-bottom))] max-md:pt-2 max-md:group-data-[typing=1]/step2:sticky max-md:group-data-[typing=1]/step2:bottom-0 max-md:group-data-[typing=1]/step2:z-20 max-md:group-data-[typing=1]/step2:border-t max-md:group-data-[typing=1]/step2:border-border"
              data-testid="step-nav-flow"
            >
            <div className="flex flex-col-reverse gap-3 md:@md:flex-row md:@md:items-stretch max-md:flex-row max-md:gap-2.5">
              <NextStepPill
                variant="secondary"
                data-testid="back-step"
                // Stacked (colonna stretta): piena larghezza e contenuto
                // centrato come da mockup. Affiancato: torna largo il minimo
                // e allineato a sinistra, così il Next si prende il resto.
                // R4-BTN-SCALE AC5: `sm` SOLO sotto md — sopra non si aggiunge
                // nessuna classe, quindi la riga affiancata/impilata da md in
                // su è quella di oggi pixel per pixel (AC6).
                className={cn(
                  PILL_SM_UNDER_MD,
                  "justify-center [&>span]:flex-none md:@md:shrink-0 md:@md:justify-start max-md:shrink-0"
                )}
                label={t("back")}
                icon={
                  <PillIcon variant="secondary">
                    <ChevronLeft className="size-5 text-primary/60" />
                  </PillIcon>
                }
                onMouseDown={keepFocusWhileTyping}
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
                // R4-BTN-SCALE AC5: `sm` SOLO sotto md. La ricetta va PRIMA
                // degli override di questo call-site: `cn` tiene l'ultimo tra
                // classi in conflitto, e qui sotto md la caption fa da
                // etichetta e resta a 15px semibold (mockup .navB) — non deve
                // scendere ai 10px della caption piccola.
                className={cn(
                  PILL_SM_UNDER_MD,
                  "md:@max-md:gap-2.5 md:@max-md:p-2.5 md:@max-md:[&>span:last-child]:size-8 md:@md:flex-[1_1_16rem] max-md:flex-1 max-md:[&_[data-pill-label]]:sr-only max-md:[&_[data-pill-caption]]:text-[15px] max-md:[&_[data-pill-caption]]:font-semibold max-md:[&_[data-pill-caption]]:normal-case max-md:[&_[data-pill-caption]]:tracking-normal max-md:[&_[data-pill-caption]]:text-foreground"
                )}
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
                onMouseDown={keepFocusWhileTyping}
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
  footer = null,
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
  /** R4-FIX 9: contenuto appeso sotto la corsia — oggi il campo scritta del
   *  gruppo Tekst, che deve stare dentro il suo tab (mobile) e sotto il suo
   *  fieldset (desktop). */
  footer?: React.ReactNode;
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
  // riparte da sinistra e sembra che non ci sia nessuna selezione.
  // R4-POLISH: si scrive `scrollLeft`, NON `scrollIntoView`. Quest'ultimo
  // scrolla ogni antenato scrollabile, documento compreso — misurato su
  // c0bba2f: 27-29px di deriva della PAGINA a ogni tap su un'opzione, con il
  // canvas sticky sopra. L'aritmetica sta in lib/configurator/lane-scroll.
  useEffect(() => {
    const lane = laneRef.current;
    if (!active || !lane || lane.scrollWidth <= lane.clientWidth) return;
    const card = lane.querySelector<HTMLElement>('[aria-checked="true"]');
    if (!card) return;
    const laneBox = lane.getBoundingClientRect();
    const cardBox = card.getBoundingClientRect();
    lane.scrollLeft = centreScrollLeft({
      laneLeft: laneBox.left,
      laneScrollLeft: lane.scrollLeft,
      laneClientWidth: lane.clientWidth,
      cardLeft: cardBox.left,
      cardWidth: cardBox.width,
    });
  }, [active, selectedId]);

  /** R4-POLISH voce 5: frecce ‹ › sulla corsia, stesso stato can-scroll delle fade. */
  const scrollLane = (dir: -1 | 1) => {
    const lane = laneRef.current;
    if (lane) lane.scrollBy({ left: arrowStep(lane.clientWidth, dir), behavior: "smooth" });
  };

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
        // `-mx-3` annulla la gronda del pannello, così la corsia scorre da bordo
        // a bordo (mockup: `.opts` sta dentro `.panelB`, senza padding intorno).
        // R4-FIX 6: niente `flex-1`/`min-h-0`. Con la pagina che scorre non c'è
        // più un'altezza da spartire, e un'altezza IMPOSTA più bassa delle card
        // le tagliava: `overflow-x:auto` fa calcolare `overflow-y:auto`, quindi
        // ciò che sporgeva finiva sotto il bordo della corsia invece di allargarla.
        // Ora la corsia è alta quanto le sue card. `relative` sta sul wrapper
        // della corsia, non qui: le fade non devono coprire legend, testo o footer.
        "md:order-2",
        "max-md:-mx-3 max-md:flex max-md:flex-col",
        !active && "max-md:hidden"
      )}
    >
      {/* sotto md il nome della categoria è già nella tab attiva e il nome
          dell'opzione scelta sta sotto il suo swatch: la legend diventa
          `sr-only` ma RESTA nel DOM (screen reader + testid
          `legend-selected`). */}
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

      {/* R4-FIX 5: le fade vivono QUI, in un wrapper che abbraccia SOLO la
          corsia scrollabile. Prima erano figlie del fieldset e coprivano tutto
          quello che ci stava dentro — la nota «una sola opzione», il campo
          scritta del footer — sbiadendo le prime lettere sul lato sinistro.
          `md:contents` = da md in su il wrapper sparisce dal layout e la corsia
          torna figlia diretta del fieldset (desktop invariato al pixel). */}
      <div className="md:contents max-md:relative max-md:min-w-0">
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
            // R4-FIX 6: `scroll-px` (non solo `-pl-`) — con lo snap, l'ULTIMA
            // card si fermava incollata al bordo destro. Niente `flex-1`: la
            // corsia è alta quanto le sue card, così nessuna sborda (vedi il
            // fieldset).
            "max-md:min-w-0 max-md:items-start max-md:touch-pan-x max-md:overflow-x-auto max-md:overscroll-x-contain max-md:scroll-px-11 max-md:px-3 max-md:py-3 max-md:snap-x max-md:snap-proximity max-md:[scrollbar-width:none] max-md:[&::-webkit-scrollbar]:hidden",
            dense
              ? // mockup `.opts.dense`: due righe che scorrono insieme
                "max-md:grid max-md:grid-flow-col max-md:justify-start max-md:gap-x-2.5 max-md:gap-y-1 max-md:py-2 max-md:[grid-template-rows:auto_auto]"
              : "max-md:flex-nowrap max-md:gap-3"
          )}
        >
          {cat.options.map((o, i) => (
            <div
              key={o.id}
              // `md:contents` = da md in su questo wrapper sparisce dal layout e
              // lo Swatch torna a essere figlio diretto della griglia, esattamente
              // come oggi (desktop invariato al pixel).
              className={cn(
                // `md:contents` = da md in su questo wrapper sparisce dal layout e
                // lo Swatch torna a essere figlio diretto della griglia, esattamente
                // come oggi (desktop invariato al pixel).
                "md:contents max-md:flex max-md:flex-none max-md:snap-start max-md:flex-col max-md:items-center",
                dense ? "max-md:w-14 max-md:gap-0.5" : "max-md:w-16 max-md:gap-1"
              )}
            >
              <Swatch
                compact={dense}
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
                  "hidden text-center leading-[1.2] max-md:block",
                  // R4-FIX 5 (B2): in corsia densa l'etichetta sta su UNA riga e
                  // si tronca — su tre righe le celle diventavano 73px e due
                  // righe non entravano nei ~110px del pannello, così i numeri
                  // finivano sopra gli swatch della riga sotto. Il nome per
                  // intero resta nell'`aria-label` dello Swatch e nel `title`.
                  dense
                    ? "w-full truncate text-[9.5px]"
                    : "text-[10px]",
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
            // mobile: stessa corsia orizzontale delle opzioni colore.
            // R4-FIX 6 (corsia «Dyr»): erano queste tre utility a far sbordare
            // le card. `flex-1` + `min-h-0` davano alla corsia l'altezza che
            // AVANZAVA nel pannello, non quella che le card CHIEDEVANO; con
            // `overflow-x:auto` il browser calcola `overflow-y:auto`, quindi le
            // card più alte finivano tagliate dal bordo invece di allargarlo, e
            // `items-start` impediva anche solo di pareggiarle. Ora: altezza dal
            // contenuto, `items-stretch` (default) e `scroll-px` simmetrico —
            // ogni card interamente dentro la corsia, la prima interamente
            // visibile all'apertura (lo `scrollLeft` che centra la corsia si
            // attiva solo sui gruppi colore, che espongono `aria-checked`).
            "max-md:flex max-md:min-w-0 max-md:gap-3 max-md:touch-pan-x max-md:overflow-x-auto max-md:overscroll-x-contain max-md:scroll-px-11 max-md:px-3 max-md:py-3 max-md:snap-x max-md:snap-proximity max-md:[scrollbar-width:none] max-md:[&::-webkit-scrollbar]:hidden"
          )}
        >
          {cat.options.map((o) => (
            <OptionCard
              key={o.id}
              label={o.name}
              imageUrl={o.image ? assetUrl(o.image) : undefined}
              selected={selectedId === o.id}
              onSelect={() => onSelect(o.id)}
              // R4-FIX 5 → R4-POLISH voce 1: `w-20` (content 62px) with a 10px
              // label — the same size the colour lane uses — makes every animal
              // name in the catalog fit whole except `KrabbeAmalfi` (68px), which
              // now gets a REAL ellipsis: `truncate`, not `line-clamp-1`.
              // line-clamp only ellipsises when it drops a LINE, so a single
              // unbreakable word was hard-clipped («Krabbe/», «Marihon»).
              // The selector targets `[data-option-label]`, not `>span`: the old
              // one also line-clamped the icon tile and killed its centring.
              className="max-md:w-20 max-md:flex-none max-md:snap-start max-md:px-2 max-md:py-2 max-md:[&_[data-option-label]]:truncate max-md:[&_[data-option-label]]:text-[10px] max-md:[&_[data-option-label]]:leading-[1.2]"
            />
          ))}
        </div>
      )}

      {/* mockup `.lane.can-l`/`.can-r` — solo mobile, solo finché c'è corsa, e
          SOLO sopra una corsia: con una sola opzione qui non c'è uno scroller
          ma una frase, e una frase non si sfuma (R4-FIX 5). */}
      {!single && (
        <>
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-y-0 left-0 z-[2] hidden w-6 bg-gradient-to-r from-[var(--mk-canvas)] to-transparent transition-opacity max-md:block",
              fades.left ? "opacity-100" : "opacity-0"
            )}
          />
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-y-0 right-0 z-[2] hidden w-6 bg-gradient-to-l from-[var(--mk-canvas)] to-transparent transition-opacity max-md:block",
              fades.right ? "opacity-100" : "opacity-0"
            )}
          />
          {/* R4-POLISH voce 5: le frecce stanno SOPRA le fade (z-3 contro z-2)
              e seguono lo stesso stato can-scroll — niente corsa, niente
              freccia, e l'attributo `hidden` la toglie anche dal tab order.
              Disco 36px + `after` (2×4px) = 44px toccabili (§5).
              // TODO:nb-review — step2.scrollOptionsBack / scrollOptionsForward */}
          <button
            type="button"
            onClick={() => scrollLane(-1)}
            aria-label={t("step2.scrollOptionsBack")}
            data-testid="option-lane-prev"
            hidden={!fades.left}
            className={cn(
              "absolute top-1/2 left-1 z-[3] hidden -translate-y-1/2 max-md:flex",
              "size-9 items-center justify-center rounded-full bg-[var(--mk-canvas)] text-sm ring-1 ring-border",
              "after:absolute after:-inset-1 after:content-[''] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            )}
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => scrollLane(1)}
            aria-label={t("step2.scrollOptionsForward")}
            data-testid="option-lane-next"
            hidden={!fades.right}
            className={cn(
              "absolute top-1/2 right-1 z-[3] hidden -translate-y-1/2 max-md:flex",
              "size-9 items-center justify-center rounded-full bg-[var(--mk-canvas)] text-sm ring-1 ring-border",
              "after:absolute after:-inset-1 after:content-[''] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            )}
          >
            ›
          </button>
        </>
      )}
      </div>

      {/* R4-FIX 9: sotto la corsia — il campo scritta del gruppo Tekst. Fuori dal
          wrapper delle fade: è testo, non deve sbiadire (R4-FIX 5). */}
      {footer && (
        <div className="mt-3 max-md:mt-0 max-md:px-3 max-md:pb-3">{footer}</div>
      )}
    </fieldset>
  );
}
