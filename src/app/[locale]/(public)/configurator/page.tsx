import type { Metadata } from "next";
import ReactDOM from "react-dom";
import { getTranslations } from "next-intl/server";
import { getActiveDesigns } from "@/lib/catalog/designs";
import { getDesignDetail, type DesignDetail } from "@/lib/catalog/design-options";
import { getDesignProducts } from "@/lib/catalog/products";
import { assetUrl } from "@/lib/storage";
import { buildConfigLinePayload } from "@/lib/configurator/line-payload";
import { pickDefaultOption } from "@/lib/configurator/default-option";
import {
  decodeConfigCode,
  toCodecDesign,
  type CodecDesign,
} from "@/lib/configurator/config-code";
import { getFeaturedConfigs } from "@/lib/catalog/featured";
import { getAdminUser } from "@/lib/auth/admin";
import { shareAllowed } from "@/lib/auth/share-gate";
import { paletteWords } from "@/lib/palettes/name-lists";
import { FeaturedStrip } from "./featured-strip";
import { ConfiguratorClient } from "./configurator-client";
import { CeramicsStep } from "./ceramics-step";
import { resolveSharedSet } from "./resolve-shared-set";
import { resolveKit, type ResolvedKit } from "./resolve-kit";

// Catalog reads go through the `catalog`-tagged data cache (PERF-1 / P-1): no
// force-dynamic, so on a cache hit the configurator render issues ~0 catalog
// queries. Admin writes call revalidateTag('catalog') to keep it fresh.

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("configurator");
  return { title: t("pageTitle") };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ConfiguratorPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const designSlug =
    typeof params.design === "string" ? params.design : undefined;
  const step = typeof params.step === "string" ? params.step : undefined;

  const [designs, t] = await Promise.all([
    getActiveDesigns(),
    getTranslations("configurator"),
  ]);

  // TWO DIFFERENT STATES, deliberately not one flag (card R-EXTRA-step3-
  // selection-e-badge-drawer, bugs 3+4):
  //
  //  a) "did the customer explicitly configure colours?" → `chosen`, i.e.
  //     `?design=`, which `goToStep` writes when leaving steps 1–2. It gates
  //     the "Your selection" box: no explicit choice ⇒ no box, not an empty one.
  //  b) "which design is the current one?" → `currentDesign` below, resolved
  //     further down as: explicit `?design=` > the shared/featured set's design
  //     > positional fallback. It drives the ceramics grid, the code and the
  //     layers.
  //
  // Collapsing them is what broke both ways: with one flag, loading the set's
  // ceramics also brought back the bogus "Your selection".
  const chosen = designSlug
    ? designs.find((d) => d.slug === designSlug)
    : undefined;
  // `origin=set`/`origin=kit`: the design in the URL was pinned by a set/kit
  // landing when it consumed `set=`/`kit=` — current design, yes; explicit
  // colour choice, no. Steps 1–2 drop the param the moment the customer
  // really configures.
  const fromSetOrigin = params.origin === "set";
  // R5-KIT: a `kit=` param is a curated list of PIECES (no colours) — resolve
  // it server-side; the client adds the lines once, then consumes the param.
  // Resolved BEFORE `selected` because it carries the landing's design.
  const rawKit = typeof params.kit === "string" ? params.kit : "";
  const kit: ResolvedKit | null = rawKit ? await resolveKit(rawKit) : null;
  const kitDesign = kit?.design
    ? designs.find((d) => d.slug === kit.design!.slug)
    : undefined;
  const fromKitOrigin = params.origin === "kit";
  const explicitChoice = chosen !== undefined && !fromSetOrigin && !fromKitOrigin;
  const selected =
    chosen ??
    kitDesign ??
    // Default to the first design that actually composes a preview, so an active
    // but layer-less design (e.g. a freshly created one) never blanks the
    // configurator's default view. Falls back to the first design (F14 AC1).
    designs.find((d) => d.defaultLayers.length > 0) ??
    designs[0];

  // ── step 3: ceramics + cart (separate layout, no shared preview) ──
  if (step === "3" && selected) {
    // CA-3: a `set=` param is a shared basket — resolve it server-side
    // (multi-supplier, live prices); the client applies/asks and then
    // consumes the param. Resolved FIRST because it carries the landing's
    // design: without it the grid below would list the fallback design's
    // ceramics (bug 4).
    const rawSet = typeof params.set === "string" ? params.set : "";
    const sharedSet = rawSet ? await resolveSharedSet(rawSet) : null;
    const fromSet = sharedSet?.context
      ? designs.find((d) => d.slug === sharedSet.context!.designSlug)
      : undefined;

    /**
     * R5-PALETTES task 9: a PaletteBar chip navigates with `?code=<code>` and
     * NO `design=`/`opt_*` at all (card §4-bis: the active palette IS the
     * URL, mirroring step 2's own `loadPalette`) — `router.push('/configurator
     * ?code=<code>&step=3')`. Steps 1–2 decode that shape CLIENT-side (the F19
     * effect in configurator-client.tsx, which then rewrites the URL to
     * opt_*); step 3 has no such effect, it's a server render, so the decode
     * has to happen here instead, straight into `selById` below. Only paid
     * for when the param is present: it needs every design's option-code map,
     * the same cost steps 1–2 already carry on every load (`detailsBySlug`
     * further down this file) — tolerant like the client version (a
     * malformed/unknown code is simply ignored, never a crash).
     */
    const rawCode = typeof params.code === "string" ? params.code : "";
    let decodedCode: {
      designSlug: string;
      selections: Record<string, string>;
      /** R5-TEXT-IDENTITY task 4: present when `?code=` itself carries an
       *  inscription — seeds the field below when `?text=` is absent. */
      customText?: string;
    } | null = null;
    if (rawCode) {
      const allDetails = await Promise.all(designs.map((d) => getDesignDetail(d.slug)));
      const codecDesigns = allDetails
        .map((d) => (d ? toCodecDesign(d) : null))
        .filter((d): d is CodecDesign => d !== null);
      try {
        decodedCode = decodeConfigCode(
          rawCode,
          (c) => codecDesigns.find((d) => d.code === c.toUpperCase()) ?? null
        );
      } catch {
        decodedCode = null;
      }
    }
    const codeDesign = decodedCode
      ? designs.find((d) => d.slug === decodedCode!.designSlug)
      : undefined;
    const currentDesign = chosen ?? codeDesign ?? fromSet ?? selected;
    // A `?code=` pick is as explicit a colour choice as `?design=` — it just
    // arrives via a palette chip instead of the design grid.
    const explicitDesignChoice = explicitChoice || (decodedCode !== null && !fromSetOrigin);

    const [detail, products, isAdmin] = await Promise.all([
      getDesignDetail(currentDesign.slug),
      getDesignProducts(currentDesign.id, currentDesign.supplierId),
      shareAllowed(await getAdminUser()),
    ]);
    if (detail) {
      // snapshot + canonical code (ADR 0011) + F19 mini-preview layers, all
      // from the shared builder (CA-3: the set landing reuses it so shared
      // lines come out byte-identical to manual adds).
      const selById: Record<string, string> = {};
      for (const c of detail.categories) {
        const v = params[`opt_${c.slug}`];
        const fromShared = sharedSet?.context?.selections[c.slug];
        const fromCode = decodedCode?.selections[c.slug];
        const opt =
          // The palette pick wins first — it's the whole point of the nav.
          (fromCode && c.options.find((o) => o.id === fromCode)) ||
          (typeof v === "string" && c.options.find((o) => o.id === v)) ||
          // Set landing: the colours come from the shared row, not from the
          // design's defaults — otherwise "this ceramic + your design" would
          // add a line that looks nothing like the set the customer opened.
          (fromShared && c.options.find((o) => o.id === fromShared)) ||
          // R2-1a: untouched category falls back to the cover default
          // (is_default else first-by-sort_order), matching steps 1-2.
          pickDefaultOption(c.options);
        if (opt) selById[c.slug] = opt.id;
      }
      // R2-2b: the free-text note rides the WORKING url (never the config code
      // nor the set= link). Honour it only when the design accepts notes.
      const rawNote = typeof params.note === "string" ? params.note : "";
      const customNote = detail.acceptsCustomNotes ? rawNote : "";
      // R5-TEXT-IDENTITY task 4: `?code=` is now the memory of an
      // inscription (task 2 folded it into the code itself). An explicit
      // `?text=` is the LIVE edit and still wins outright — it's present
      // even as "" (an explicit clear); only its ABSENCE falls back to
      // what `?code=` decoded, so opening a saved/shared code seeds the
      // field instead of showing it empty.
      const rawText =
        typeof params.text === "string" ? params.text : decodedCode?.customText ?? "";
      const customText = detail.acceptsCustomText ? rawText : "";
      const { snapshot, configCode, designLayers } = buildConfigLinePayload(
        detail,
        selById,
        customNote,
        customText
      );

      // No <Suspense> around the client steps: the page already awaits all
      // data (dynamic via `await searchParams`), so the boundary never showed
      // a fallback — it only made React stream the subtree as a hidden
      // `div#S:0` at the end of <body>, briefly leaving TWO copies of the
      // step in the DOM (flaky Playwright strict-mode violations).
      return (
        <section>
          <h1 className="sr-only">{t("pageTitle")}</h1>
          <CeramicsStep
              products={products.map((p) => ({
                id: p.id,
                slug: p.slug,
                nameNo: p.nameNo,
                nameEn: p.nameEn,
                priceCents: p.price.amountCents,
                currency: p.price.currency,
                image: p.image,
                pieces: p.pieces,
                descriptionNo: p.descriptionNo,
                descriptionEn: p.descriptionEn,
                attributes: p.attributes,
                photos: p.photos,
                seriesNo: p.seriesNo,
                seriesEn: p.seriesEn,
              }))}
              design={{
                slug: currentDesign.slug,
                name: currentDesign.name,
                supplierId: currentDesign.supplierId,
                supplierName: currentDesign.supplierName,
              }}
              snapshot={snapshot}
              configCode={configCode}
              designLayers={designLayers}
              hasExplicitDesign={explicitDesignChoice}
              selections={selById}
              sharedSet={sharedSet}
              paletteWords={paletteWords()}
              isAdmin={isAdmin}
            />
        </section>
      );
    }
  }

  // ── steps 1 & 2: unified shell with the persistent preview ──
  // Details for every design so the client can switch design/step without a
  // server roundtrip (keeps the preview stable).
  const details = await Promise.all(
    designs.map((d) => getDesignDetail(d.slug))
  );
  const detailsBySlug: Record<string, DesignDetail> = {};
  designs.forEach((d, i) => {
    const detail = details[i];
    if (detail) detailsBySlug[d.slug] = detail;
  });

  // R5-DESIGN-SWITCH T1: conteggio ceramiche per design (mockup `:149`
  // «covers N ceramics») — stessa `getDesignProducts` (whitelist, cache
  // `catalog`: su hit ~0 query in più).
  const designProducts = await Promise.all(
    designs.map((d) => getDesignProducts(d.id, d.supplierId))
  );
  const productCounts: Record<string, number> = {};
  designs.forEach((d, i) => {
    productCounts[d.slug] = designProducts[i].length;
  });

  // Preload the default design's composed layers so the first paint is the
  // composed plate, not a hole/skeleton (F14 AC1).
  // F26.1 invariant: preload URL === render URL (both class-derived @512),
  // otherwise the browser downloads two variants of every layer.
  for (const layer of selected.defaultLayers) {
    ReactDOM.preload(assetUrl(layer.src), {
      as: "image",
      fetchPriority: "high",
    });
  }

  // F28: admin-curated featured strip, home/step 1 only (ADR 0016). Valid
  // rows only — an entry that no longer resolves is hidden here, badged in
  // admin. Cache tags featured+catalog → ~0 queries on hit. 0 valid → the
  // section does not exist and the home is identical to before.
  const featured =
    step !== "2" ? (await getFeaturedConfigs()).filter((f) => f.valid) : [];

  return (
    // R4-RESTYLE: plain section again — the mobile editor's height chain (and
    // the globals.css `:has([data-editor="mobile"])` block that drove it) is
    // gone; step 2 is an ordinary page scroller with a sticky canvas.
    <section>
      <h1 className="sr-only">{t("pageTitle")}</h1>
      {/* no <Suspense>: see the step-3 note above */}
      <ConfiguratorClient
        designs={designs}
        detailsBySlug={detailsBySlug}
        productCounts={productCounts}
        kit={kit}
        // Fix-wave finding 3: resolved HERE, server-side, so
        // `MK_PALETTE_WORDS` (not `NEXT_PUBLIC_*`, deliberately — card
        // §2/§4-bis says it must not become public) actually reaches the
        // client instead of always reading `undefined` from the browser.
        paletteWords={paletteWords()}
        featuredSlot={
          featured.length > 0 ? (
            <FeaturedStrip
              key="featured-strip"
              items={featured.map((f) => ({
                id: f.id,
                kind: f.kind,
                payload: f.payload,
                thumbUrl: assetUrl(f.thumbImage),
                labelNo: f.labelNo,
                labelEn: f.labelEn,
                designName: f.designName ?? "",
                designNameEn: f.designNameEn ?? "",
                setCount: f.setCount,
                price: f.price ?? null,
                customImage: f.customImage,
              }))}
            />
          ) : null
        }
      />
    </section>
  );
}
