"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  fitRatio,
  INSCRIPTION_CENTER_Y,
  INSCRIPTION_FONT_SIZE,
  INSCRIPTION_MAX_WIDTH,
  taperForLength,
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
  const taper = taperForLength(Array.from(text).length);

  useIsoLayoutEffect(() => {
    const el = ref.current;
    const box = el?.parentElement;
    // Il quadrato del piatto. Si misura LUI e non la scatola del testo, la cui
    // larghezza dipende dal corpo: osservare quella farebbe rincorrere la
    // misura a sé stessa.
    const square = box?.parentElement;
    if (!el || !box || !square) return;

    const measure = () => {
      // Misura a corpo pieno e applica il rapporto nella stessa passata di
      // layout: nessun lampo a corpo sbagliato, nessun secondo giro.
      el.style.setProperty("--fit", "1");
      el.style.setProperty(
        "--fit",
        // La lunghezza si conta in code point, come il cap del campo: una
        // emoji è un carattere per chi scrive, due per `String.length`.
        String(fitRatio(el.scrollWidth, box.clientWidth, Array.from(text).length))
      );
    };
    measure();

    // Un ridimensionamento normale non avrebbe bisogno di rimisurare — `cqmin`
    // scala scatola e testo insieme, quindi il rapporto resta valido (AC 4) —
    // ma il riquadro può valere **zero**: a step 1 su telefono la colonna
    // dell'anteprima resta montata e solo `display:none` (F14, mai un
    // rimontaggio). Lì la misura dice «non so», si resta sulla sola rampa, e
    // senza questo osservatore ci si resterebbe anche dopo, con una dedica
    // lunga troncata invece che rimpicciolita.
    const ro = new ResizeObserver(measure);
    ro.observe(square);
    return () => ro.disconnect();
  }, [text]);

  return (
    <div
      aria-hidden="true"
      data-testid="preview-inscription"
      className="pointer-events-none absolute left-1/2 -translate-x-1/2 -translate-y-1/2 text-center"
      style={{
        top: `${INSCRIPTION_CENTER_Y}%`,
        maxWidth: `${INSCRIPTION_MAX_WIDTH}cqmin`,
      }}
    >
      <span
        ref={ref}
        className="block overflow-hidden text-ellipsis whitespace-nowrap"
        style={{
          // Serif corsivo scuro: la veste della parola che lo studio disegna
          // già a mano. Nessun font nuovo — stack di sistema (la card: «non si
          // inventa un font»).
          // Times, non Georgia: a parità di corpo Georgia ha aste più spesse
          // e occhio più grande, e sul piatto sembrava scritta in grassetto
          // accanto ai tratti sottili dell'arte (ruling TL 20/9).
          fontFamily: '"Times New Roman", Times, serif',
          fontStyle: "italic",
          color: "var(--mk-dark)",
          opacity: 0.78,
          // Il fallback è la rampa, non 1: al primo disegno `--fit` non è
          // ancora stato scritto da nessuno, e senza questo una pagina che
          // arriva con un `?text=` uscirebbe a corpo pieno e TAGLIATA prima
          // dell'idratazione. La rampa dipende solo dalla lunghezza, quindi il
          // server la sa già. NON va messo `--fit` dentro `style`: React lo
          // riapplicherebbe a ogni render del padre, cancellando la misura che
          // l'effetto (deps `[text]`) non rifarebbe.
          fontSize: `calc(var(--fit, ${taper}) * ${INSCRIPTION_FONT_SIZE}cqmin)`,
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
  const [fadeIn, setFadeIn] = useState(false);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (targetKey === shown.key) {
      setIncoming(null); // back to current set: drop any in-flight overlay
      return;
    }

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    let cancelled = false;
    preloadAll(layers).then(() => {
      if (cancelled) return;
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
            className="absolute inset-0 flex items-center justify-center transition-opacity"
            style={{ opacity: fadeIn ? 1 : 0, transitionDuration: `${FADE_MS}ms` }}
            data-testid="preview-incoming"
          >
            <LayerStack layers={incoming.layers} alt={alt} />
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
