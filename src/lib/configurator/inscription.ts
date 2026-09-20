/**
 * R5-TEXT-LIVE (card 6a) — le parole del cliente sul piatto, mentre le scrive.
 *
 * Due decisioni, entrambe della card:
 *
 * 1. UNA sola convenzione di posizione, non un dato per design: terzo
 *    inferiore, centrata, dentro l'area interna. Se un design vorrà un punto
 *    suo, è roba della 6b o dell'admin.
 * 2. Dove lo studio ha già disegnato la parola — il gruppo «Tekst», un layer
 *    per posizione — la scritta viva NON si disegna: se ne vedrebbero due.
 *    Lì l'anteprima resta identica a prima, pixel per pixel (AC 2).
 */
import { isCustomTextOffered, type TextGroupCandidate } from "./text-option";

/**
 * Geometria, in percentuale del QUADRATO che contiene l'arte del piatto — non
 * del frame: sotto `md` il frame è rettangolare (l'editor mobile) e il piatto
 * ci sta dentro in `object-contain`. In CSS il quadrato è `cqmin` del
 * contenitore `@container/plate`, così la scritta segue il piatto a ogni
 * ridimensionamento senza un ResizeObserver (AC 4).
 *
 * I numeri sono misurati sull'arte di catalogo (PNG 1500², compositi di tutti
 * i layer), non scelti a occhio:
 * - il piatto occupa il 94,3% del lato (bbox alpha 48..1462);
 * - la fascia decorata esterna comincia a r = 0,79 del raggio del piatto (il
 *   profilo radiale dell'inchiostro dà la stessa banda su `amalfi-dyr` e su
 *   `krabbe`: è l'arte del bordo, condivisa);
 * - con la riga centrata al 68% dell'altezza, il suo bordo inferiore cade a
 *   dy = 0,47 R, dove la corda dentro r = 0,79 R vale il 59,8% del lato.
 * 52% lascia quasi 8 punti di margine: è l'AC 3.
 *
 * Se cambia l'arte del bordo, questi tre numeri vanno rimisurati insieme.
 */
/** Centro verticale della riga, in % dell'altezza del quadrato. */
export const INSCRIPTION_CENTER_Y = 68;
/** Larghezza massima della riga, in `cqmin`. */
export const INSCRIPTION_MAX_WIDTH = 52;
/** Corpo del testo prima del fit, in `cqmin`. */
export const INSCRIPTION_FONT_SIZE = 7;
/** Sotto questo fattore non si rimpicciolisce più: si tronca (AC 3). */
export const INSCRIPTION_MIN_FIT = 0.45;

/**
 * Quanto rimpicciolire la riga perché stia nella sua scatola. La larghezza di
 * una riga è lineare nel corpo, quindi una passata basta: niente ciclo, niente
 * seconda misura. Una misura presa prima del layout (0 o NaN) vale «non so»,
 * e in dubbio si lascia il corpo pieno.
 */
export function fitRatio(textWidth: number, boxWidth: number): number {
  if (!(textWidth > 0) || !(boxWidth > 0)) return 1;
  return Math.max(INSCRIPTION_MIN_FIT, Math.min(1, boxWidth / textWidth));
}

/** La scritta viva si disegna? */
export function showsLiveInscription({
  acceptsCustomText,
  textGroup,
  selectedOptionId,
  text,
}: {
  acceptsCustomText: boolean;
  textGroup: TextGroupCandidate | null;
  selectedOptionId: string | undefined;
  text: string;
}): boolean {
  // Stesso cancello del campo: se il cliente non può chiedere la scritta, non
  // c'è niente da mostrare — e il testo in stato può essere rimasto lì da un
  // altro design.
  if (!isCustomTextOffered({ acceptsCustomText, textGroup, selectedOptionId }))
    return false;
  // Il design modella le posizioni da sé (gruppo «Tekst»): la parola è già
  // dipinta nel layer che il cliente ha scelto. Le posizioni sono la 6b.
  if (textGroup) return false;
  return text.trim().length > 0;
}
