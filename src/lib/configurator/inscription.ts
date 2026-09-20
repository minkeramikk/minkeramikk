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
import { MAX_CUSTOM_TEXT } from "@/lib/orders/schema";
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
/**
 * Centro verticale della riga, in % dell'altezza del quadrato.
 *
 * Era 68 — il terzo inferiore della card, preso dal «Tekst» che lo studio
 * disegna su Krabbe. A schermo cadeva **sopra il disegno**: su Amalfi il terzo
 * inferiore è pieno di foglie e di puntini, mentre il centro del piatto è
 * l'unica campitura vuota (inchiostro 0% per r < 0,30 R, misurato). Ruling TL
 * 20/9: la riga si centra sull'asse Y. Deviazione consapevole dalla §2 della
 * card, decisa guardando il piatto vero.
 */
export const INSCRIPTION_CENTER_Y = 50;
/**
 * Larghezza massima della riga, in `cqmin`. Al centro del piatto la corda è
 * l'intero diametro, quindi 52% sta larghissima dentro la fascia decorata (che
 * comincia a r = 0,79 R): il numero regge anche se la riga tornasse più in
 * basso, dove era stato calcolato — al bordo inferiore della riga al 68% la
 * corda valeva comunque il 59,8% del lato.
 */
export const INSCRIPTION_MAX_WIDTH = 52;
/**
 * Corpo del testo prima del fit, in `cqmin`. Era 7: sul piatto vero leggeva
 * grosso e pesante accanto a un'arte fatta di tratti sottili (ruling TL 20/9,
 * a schermo). Sui testi lunghi non cambia niente — lì il corpo lo decide la
 * larghezza massima, non questo numero — cambia sulle dediche corte, che
 * smettono di gridare.
 */
export const INSCRIPTION_FONT_SIZE = 5;
/** Sotto questo fattore non si rimpicciolisce più: si tronca (AC 3). */
export const INSCRIPTION_MIN_FIT = 0.45;

/**
 * Fin qui la dedica è scritta a corpo pieno: una parola o due sul piatto stanno
 * bene grandi.
 */
export const INSCRIPTION_TAPER_FROM = 10;
/**
 * …e alla lunghezza massima del campo vale questa frazione del corpo. La riga
 * cala con i caratteri invece di restare grande fino a sbattere contro il muro
 * della larghezza: una dedica lunga dev'essere una scritta fine, non un titolo
 * (ruling TL 20/9, a schermo).
 */
export const INSCRIPTION_TAPER_TO = 0.7;

/**
 * Quanto vale il corpo alla lunghezza data: 1 fino a `INSCRIPTION_TAPER_FROM`,
 * poi giù in linea retta fino a `INSCRIPTION_TAPER_TO` alla lunghezza massima
 * del campo. Legato a `MAX_CUSTOM_TEXT` e non a un 25 scritto qui, così se il
 * cap cambia la rampa lo segue invece di finire fuori scala.
 */
export function taperForLength(length: number): number {
  if (!(length > INSCRIPTION_TAPER_FROM)) return 1;
  const span = MAX_CUSTOM_TEXT - INSCRIPTION_TAPER_FROM;
  if (span <= 0) return INSCRIPTION_TAPER_TO;
  const over = Math.min(length, MAX_CUSTOM_TEXT) - INSCRIPTION_TAPER_FROM;
  return 1 - (over / span) * (1 - INSCRIPTION_TAPER_TO);
}

/**
 * Quanto rimpicciolire la riga. Due vincoli, e vince il più stretto:
 * la rampa sulla lunghezza (`taperForLength`, che è estetica) e la larghezza
 * disponibile (che è l'AC 3, e non è negoziabile). La larghezza di una riga è
 * lineare nel corpo, quindi una passata basta: niente ciclo, niente seconda
 * misura. Una misura presa prima del layout (0 o NaN) vale «non so», e in
 * dubbio si resta sulla rampa invece di inventare un rimpicciolimento.
 */
export function fitRatio(
  textWidth: number,
  boxWidth: number,
  length: number
): number {
  const taper = taperForLength(length);
  if (!(textWidth > 0) || !(boxWidth > 0)) return taper;
  return Math.max(INSCRIPTION_MIN_FIT, Math.min(taper, boxWidth / textWidth));
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
