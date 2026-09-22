"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  INSCRIPTION_CENTER_Y,
  INSCRIPTION_FIT_PASSES,
  INSCRIPTION_FONT_SIZE,
  INSCRIPTION_MAX_WIDTH,
  scaleForLength,
  shrinkStep,
} from "@/lib/configurator/inscription";

export interface PreviewLayer {
  src: string;
  /** Recolorable layers blend with multiply (legacy-validated technique, ADR 0002). */
  recolor?: boolean;
}

/**
 * Live design preview (DESIGN-SYSTEM §3.11) — the continuity element of the
 * configurator (F14):
 * - first paint is the composed plate (layers from SSR), never a hole;
 * - changing design cross-fades ~200ms: the OLD layers stay painted until the
 *   NEW ones have loaded, then the new ones fade in and REPLACE them (no stale
 *   layers left behind, no white flash);
 * - `prefers-reduced-motion: reduce` → no fade, immediate swap once loaded;
 * - skeleton shows only when there is genuinely nothing to display yet.
 */

const FADE_MS = 200;

/**
 * Il riquadro dell'arte dentro il frame. Era un letterale dentro `LayerStack`;
 * ora lo usano in due (lo stack e la scritta viva) e devono restare la STESSA
 * scatola, altrimenti la scritta scivola rispetto al piatto.
 */
const ART_BOX = "h-[84%] w-[84%]";

/**
 * `useLayoutEffect` avvisa in SSR, e questo componente renderizza anche lì
 * (un `?text=` nell'URL arriva già pieno dal server). Il misuratore serve solo
 * nel browser: in SSR non c'è niente da misurare.
 */
const useIsoLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

const keyOf = (layers: PreviewLayer[]) => layers.map((l) => l.src).join("|");

function preloadAll(layers: PreviewLayer[]): Promise<void> {
  return Promise.all(
    layers.map(
      (l) =>
        new Promise<void>((resolve) => {
          const img = new window.Image();
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = l.src;
        })
    )
  ).then(() => undefined);
}

function LayerStack({
  layers,
  alt,
  priority,
}: {
  layers: PreviewLayer[];
  alt: string;
  priority?: boolean;
}) {
  return (
    <div
      className={`relative ${ART_BOX}`}
      style={{
        // R4-CANVAS-WHITE AC7: era 18%. Su fondo caldo leggeva morbida; su
        // `--mk-canvas` (bianco pieno) la stessa ombra diventa un alone grigio
        // attorno al piatto — sporco, non profondità. 13% tiene lo stacco
        // senza sporcare (evidenza: docs/evidence/r4-canvas-white/ac7-shadow).
        filter:
          "drop-shadow(0 14px 28px color-mix(in oklab, var(--mk-dark) 13%, transparent))",
      }}
    >
      {layers.map((layer, i) => (
        // eslint-disable-next-line @next/next/no-img-element -- composited catalog art from storage
        <img
          key={`${layer.src}-${i}`}
          src={layer.src}
          alt={i === 0 ? alt : ""}
          loading={priority && i === 0 ? "eager" : undefined}
          fetchPriority={priority && i === 0 ? "high" : undefined}
          className="absolute inset-0 h-full w-full object-contain"
          style={layer.recolor ? { mixBlendMode: "multiply" } : undefined}
        />
      ))}
    </div>
  );
}

/**
 * R5-TEXT-LIVE — le parole del cliente sul piatto, mentre le scrive.
 *
 * `aria-hidden`: le stesse parole sono nel campo che ha appena scritto, uno
 * screen reader le direbbe due volte. `pointer-events-none`: è un'anteprima,
 * non un bersaglio.
 */
function Inscription({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  // La rampa sulla lunghezza non ha bisogno del DOM, quindi entra già nel
  // render: senza, il primo disegno (SSR o idratazione, quando la pagina
  // arriva con un `?text=`) uscirebbe a corpo pieno e TAGLIATO, per saltare
  // subito dopo alla misura giusta. La misura la raffina l'effetto, e la
  // raffina solo in basso.
  const scale = scaleForLength(Array.from(text).length);

  useIsoLayoutEffect(() => {
    const el = ref.current;
    const box = el?.parentElement;
    // Il quadrato del piatto. Si osserva LUI e non la scatola del testo: la sua
    // larghezza non dipende dal corpo, quindi la misura non rincorre sé stessa.
    const square = box?.parentElement;
    if (!el || !box || !square) return;

    const measure = () => {
      // Il taglio si accende SOLO da qui. Nell'HTML del server `--fit` non è
      // ancora stato scritto da nessuno e il blocco può venire più alto del
      // dovuto: con `overflow:hidden` in classe, quel primo fotogramma
      // uscirebbe con tre puntini per poi saltare alla misura giusta.
      el.style.overflow = "hidden";

      let fit = scale;
      el.style.setProperty("--fit", String(fit));

      // Il blocco deve stare in `INSCRIPTION_MAX_LINES` righe, e una parola
      // sola non deve mai essere più larga della scatola. Non si calcola: si
      // guarda com'è venuto e si stringe di un passo, al massimo
      // `INSCRIPTION_FIT_PASSES` volte. Una formula non c'è, perché quante
      // righe servano dipende da DOVE cadono gli spazi, e quello lo sa solo il
      // browser che ha appena mandato il testo a capo.
      for (let pass = 0; pass < INSCRIPTION_FIT_PASSES; pass++) {
        const lineHeight = parseFloat(getComputedStyle(el).lineHeight);
        // Zero = il riquadro è chiuso (`display:none`, vedi sotto); NaN = il
        // line-height è tornato `normal` e non so quanto è alta una riga. In
        // entrambi i casi «non so» deve voler dire «non tocco»: con un ripiego
        // a 1 il conto delle righe direbbe ~20 e il ciclo inchioderebbe ogni
        // scritta al pavimento, in silenzio.
        if (!(lineHeight > 0)) break;
        const next = shrinkStep(fit, {
          tooWide: el.scrollWidth > el.clientWidth,
          lines: Math.round(el.scrollHeight / lineHeight),
        });
        if (next === null) break;
        fit = next;
        el.style.setProperty("--fit", String(fit));
      }
    };
    measure();

    // Il riquadro può valere **zero**: a step 1 su telefono la colonna
    // dell'anteprima resta montata e solo `display:none` (F14, mai un
    // rimontaggio). Lì la misura non dice niente di utile, e senza questo
    // osservatore ci si resterebbe anche dopo, con una dedica lunga troncata
    // invece che mandata a capo.
    const ro = new ResizeObserver(measure);
    ro.observe(square);

    // Il font arriva DOPO. `next/font` serve Lora con `display: swap`, quindi
    // la prima misura può cadere sul ripiego, che ha le metriche di Times e non
    // di Lora: il fattore resterebbe cablato su larghezze di glifo sbagliate, e
    // quando Lora atterra il blocco si riflowa senza che nessuno rimisuri.
    // Peggio ancora perché il ciclo si ferma al PRIMO fattore che sta: atterra
    // sempre sul filo delle due righe, cioè nel punto peggiore in cui farsi
    // cambiare le metriche sotto i piedi. Il riquadro non cambia dimensione
    // quando cambia un font, quindi il `ResizeObserver` qui non aiuta.
    let alive = true;
    document.fonts?.ready.then(() => {
      if (alive) measure();
    });

    return () => {
      alive = false;
      ro.disconnect();
    };
  }, [text, scale]);

  return (
    <div
      aria-hidden="true"
      data-testid="preview-inscription"
      className="pointer-events-none absolute left-1/2 -translate-x-1/2 -translate-y-1/2 text-center"
      style={{
        top: `${INSCRIPTION_CENTER_Y}%`,
        // Larghezza FISSA, non `max-width`: con un massimo la scatola si
        // stringe sul testo, quindi «quanto spazio c'è» e «quanto testo c'è»
        // diventano lo stesso numero — la misura non ha più un muro contro cui
        // confrontarsi e la riga finisce sempre larga quanto la sua scatola, al
        // decimo di pixel. Da lì i tre puntini: basta un arrotondamento e il
        // browser si mangia le ultime lettere. Fissa, il muro è il muro, e
        // l'aria viene dal ciclo, che stringe di un passo intero (10%) e quindi
        // non atterra mai sul confine.
        width: `${INSCRIPTION_MAX_WIDTH}cqmin`,
      }}
    >
      <span
        ref={ref}
        // Va a capo, ma solo negli spazi: una parola non si spezza mai a metà
        // (ruling TL 20/9). Se una parola sola è più larga della scatola, a
        // rimpicciolirla ci pensa il ciclo di misura, e sotto il pavimento
        // arrivano i puntini. Attenzione a cosa promette questa riga: i puntini
        // sono orizzontali, quindi valgono SOLO per una parola sola più larga
        // della scatola. Un blocco che al pavimento vuole ancora tre righe le
        // disegna — `INSCRIPTION_MAX_LINES` è un obiettivo del ciclo, non una
        // garanzia del ritaglio. A quel corpo il blocco resta comunque dentro
        // la campitura vuota: è una promessa imprecisa, non un pixel fuori.
        className="block text-ellipsis"
        style={{
          // Corsivo vero, non l'italico di un font da interfaccia: quello che
          // lo studio dipinge è calligrafia. La famiglia è dichiarata una volta
          // sola, in `layout.tsx`, col perché di quella scelta e non di un'altra.
          // Il ripiego è Times e non Georgia: a parità di corpo Georgia ha aste
          // più spesse e occhio più grande, e sul piatto sembrava scritta in
          // grassetto accanto ai tratti sottili dell'arte.
          fontFamily: 'var(--font-inscription), "Times New Roman", Times, serif',
          fontStyle: "italic",
          fontWeight: 500,
          color: "var(--mk-dark)",
          opacity: 0.78,
          // Il primo fotogramma servito dal server non è misurato: la rampa
          // conosce la lunghezza, non DOVE cadono gli spazi, che è ciò che
          // decide quante righe vengono. Una dedica lunga può quindi uscire su
          // tre righe per un fotogramma, e all'idratazione tornare a due.
          // Scelta voluta: l'alternativa è partire tutti da
          // `INSCRIPTION_SCALE_LONG`, che farebbe saltare ANCHE le dediche
          // corte — il caso comune — per proteggere quello raro. Il blocco a
          // tre righe resta comunque dentro la campitura vuota (angoli a
          // ±6,6cqmin, mezza corda 8,79cqmin).
          // Il fallback è la rampa sulla lunghezza, non 1: al primo disegno `--fit` non è
          // ancora stato scritto da nessuno, e senza questo una pagina che
          // arriva con un `?text=` uscirebbe a corpo pieno e TAGLIATA prima
          // dell'idratazione. La rampa dipende solo dalla lunghezza, quindi il
          // server la sa già. NON va messo `--fit` dentro `style`: React lo
          // riapplicherebbe a ogni render del padre, cancellando la misura che
          // l'effetto (deps `[text]`) non rifarebbe.
          fontSize: `calc(var(--fit, ${scale}) * ${INSCRIPTION_FONT_SIZE}cqmin)`,
          lineHeight: 1.2,
        }}
      >
        {text}
      </span>
    </div>
  );
}

export function PreviewCanvas({
  layers,
  caption,
  alt,
  inscription,
  className,
  /**
   * R5-DESIGN-SWITCH T2: the design currently on screen (slug). The loader
   * fires ONLY when THIS changes: a color tap keeps the same design, so it
   * stays a plain fade. Absent (callers that never switch design) = never.
   *
   * Screen-reader copy for the loader (`role="status"`): passed through
   * the optional `loadingLabel` prop; `alt` stays the stable design name.
   */
  designKey,
  loadingLabel,
}: {
  layers: PreviewLayer[];
  /** Rich node, not just text: the configurator caption carries a link. */
  caption?: React.ReactNode;
  alt: string;
  /**
   * R5-TEXT-LIVE: la scritta del cliente, già decisa dal chiamante (vedi
   * `showsLiveInscription`). Assente = anteprima di sempre.
   */
  inscription?: string;
  className?: string;
  designKey?: string;
  loadingLabel?: string;
}) {
  const targetKey = keyOf(layers);

  // committed layers (painted now); initialized from props so SSR paints them
  const [shown, setShown] = useState<{ key: string; layers: PreviewLayer[] }>({
    key: targetKey,
    layers,
  });
  // layers fading in on top during a transition (null when stable)
  const [incoming, setIncoming] = useState<{
    key: string;
    layers: PreviewLayer[];
  } | null>(null);
  // R5-DESIGN-SWITCH T2: the layer key changed but the new art has not
  // loaded yet → the whole-canvas spinning-plate overlay (data-testid
  // "design-loader"). Only when the DESIGN changed (`designKey` prop), never
  // on a color tap (same design, only recolors) — the fade below covers
  // that, unchanged. Overlay is state derived from the transition, so no
  // unmount reset: useState dies with the component.
  const [designLoading, setDesignLoading] = useState(false);
  // Committed design identity (ref, not state: updating it must not
  // re-trigger the transition effect below and re-run the preload).
  // Initialized from the first render's `designKey` so a mount-then-decode
  // (configurator lands with ?design= already in the URL) is not read as
  // a switch away from nothing.
  const committedDesign = useRef<string | undefined>(designKey);
  const [fadeIn, setFadeIn] = useState(false);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (targetKey === shown.key) {
      setIncoming(null); // back to current set: drop any in-flight overlay
      setDesignLoading(false);
      if (designKey !== undefined) committedDesign.current = designKey;
      return;
    }

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    // Loader only on a DESIGN switch (never on a color tap, which keeps the
    // same designKey and fades, unchanged). Reduced-motion → no loader and
    // no animation at all: immediate swap once loaded.
    const isDesignChange =
      designKey !== undefined && designKey !== committedDesign.current;
    if (isDesignChange && !reduce) setDesignLoading(true);

    let cancelled = false;
    preloadAll(layers).then(() => {
      if (cancelled) return;
      setDesignLoading(false);
      if (designKey !== undefined) committedDesign.current = designKey;
      if (reduce) {
        setShown({ key: targetKey, layers }); // immediate swap (AC4)
        setIncoming(null);
        return;
      }
      // mount the new layers on top at opacity 0, then fade to 1 (AC3)
      setIncoming({ key: targetKey, layers });
      setFadeIn(false);
      requestAnimationFrame(() => {
        if (!cancelled) requestAnimationFrame(() => setFadeIn(true));
      });
    });

    return () => {
      cancelled = true;
    };
    // drive ONLY off the content key: same content across re-renders is a no-op
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey, shown.key]);

  // commit the overlay into `shown` once the fade has had time to run
  useEffect(() => {
    if (!incoming || !fadeIn) return;
    commitTimer.current = setTimeout(() => {
      setShown(incoming);
      setIncoming(null);
      setFadeIn(false);
    }, FADE_MS);
    return () => {
      if (commitTimer.current) clearTimeout(commitTimer.current);
    };
  }, [incoming, fadeIn]);

  const nothingToShow = shown.layers.length === 0 && !incoming;

  return (
    <div className={className} data-testid="preview-canvas">
      <div
        // R4-STEP2: stable hook for callers styling the inner frame (the
        // mobile editor canvas, configurator-client.tsx) — an attribute
        // selector survives a refactor of this component's nesting; a
        // structural one (`[&>div>div]`) would silently break. Purely a
        // selector target, no rendering change.
        data-canvas-frame
        className="relative mx-auto flex aspect-square max-w-[520px] items-center justify-center rounded-lg bg-[var(--mk-canvas)] shadow-(--shadow-card)"
      >
        {nothingToShow && (
          <div
            data-testid="preview-skeleton"
            className="absolute inset-[8%] animate-pulse rounded-lg bg-muted"
          />
        )}

        {shown.layers.length > 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <LayerStack layers={shown.layers} alt={alt} priority />
          </div>
        )}

        {incoming && (
          <div
            className="absolute inset-0 flex items-center justify-center transition-opacity motion-reduce:transition-none"
            style={{ opacity: fadeIn ? 1 : 0, transitionDuration: `${FADE_MS}ms` }}
            data-testid="preview-incoming"
          >
            <LayerStack layers={incoming.layers} alt={alt} />
          </div>
        )}

        {/* R5-DESIGN-SWITCH T2 — whole-canvas spinning-plate loader, only
            while a DESIGN switch preloads (mockup-palettebar.html :57-59).
            `role="status"` announces the switch via `loadingLabel`
            (falls back to `alt`); `alt` itself stays the stable design name.
            Gated to motion-safe:
            reduced-motion never renders it (immediate swap), and color taps
            never trigger it (`designKey`, above). */}
        {designLoading && (
          <div
            role="status"
            data-testid="design-loader"
            aria-label={loadingLabel ?? alt}
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-[color-mix(in_oklab,var(--mk-canvas)_72%,transparent)]"
          >
            {/* `spinplate` = mockup class verbatim (globals.css, from
                mockup-palettebar.html :57-59; size-16 + caption verbatim
                from r5-animation artifact `Loader`), incl. its own CSS
                reduced-motion guard. */}
            <div aria-hidden="true" className="spinplate size-16 opacity-80">
              <LayerStack layers={shown.layers} alt="" />
            </div>
            <span className="text-[11px] text-muted-foreground">
              {loadingLabel ?? alt}
            </span>
          </div>
        )}

        {/* R5-TEXT-LIVE — sopra gli strati, mai sopra lo scheletro. Il
            quadrato è l'arte CONTENUTA (`100cqmin` del riquadro), non il
            riquadro: sotto `md` il frame è rettangolare e il piatto ci sta in
            `object-contain`, quindi la scritta segue il piatto invece che la
            scatola (AC 4). Contenitore NOMINATO, così un `@container` annidato
            più avanti non se lo prende. */}
        {inscription && !nothingToShow && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div
              className={`flex items-center justify-center ${ART_BOX}`}
              // `container-type: size`, NON `inline-size` (che è ciò che
              // emette `@container/plate`): con `inline-size` l'asse di blocco
              // non è contenuto e `cqmin` ripiega sull'altezza del VIEWPORT,
              // cioè vale la larghezza del riquadro. Sul desktop non si vede —
              // il frame è quadrato — ma nell'editor mobile il riquadro è
              // 281×244 e la scritta veniva il 15% troppo grande e cadeva al
              // 70,9% invece che al 68%: l'AC 4 in pieno. Misurato in pagina.
              style={{ containerType: "size", containerName: "plate" }}
            >
              <div className="relative aspect-square w-[100cqmin]">
                <Inscription text={inscription} />
              </div>
            </div>
          </div>
        )}
      </div>
      {caption && (
        <p className="mt-3 text-center text-xs italic text-muted-foreground">
          {caption}
        </p>
      )}
    </div>
  );
}
