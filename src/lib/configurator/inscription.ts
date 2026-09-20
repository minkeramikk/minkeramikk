/**
 * R5-TEXT-LIVE (card 6a) — le parole del cliente sul piatto, mentre le scrive.
 *
 * Due decisioni, entrambe della card:
 *
 * 1. UNA sola convenzione di posizione, non un dato per design. La card la
 *    chiedeva nel terzo inferiore; a schermo il TL l'ha spostata al centro
 *    (ruling 20/9, motivato dove sta la costante). Se un design vorrà un punto
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
 * ci sta dentro in `object-contain`. In CSS il quadrato è `cqmin` di un
 * contenitore con `container-type: size` (non `inline-size`: con quello
 * `cqmin` ripiega sul viewport e vale la larghezza), così la scritta segue il
 * piatto a ogni ridimensionamento senza doverla rimisurare (AC 4).
 *
 * Le misure vive sono queste, prese sull'arte di catalogo (PNG 1500², compositi
 * di tutti i layer) e non scelte a occhio:
 * - il piatto occupa il **94,3%** del lato (bbox alpha 48..1462);
 * - la campitura vuota al centro arriva a **r = 0,233 R** su `blomster-2` e a
 *   **r = 0,318 R** su `amalfi-dyr`: è il vincolo vero da quando la riga sta al
 *   centro, ed è molto più dentro della fascia decorata esterna (r = 0,79 R),
 *   su cui era tarata la larghezza quando la riga stava in basso.
 *
 * Se cambia l'arte, sono questi tre numeri che vanno rimisurati insieme — e con
 * loro le due costanti che ne discendono, larghezza massima e corpo.
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
 * Larghezza massima della riga, in `cqmin`. Non è più una rete di sicurezza: è
 * IL vincolo. 52 era tarato sulla fascia decorata esterna (r = 0,79 R), giusto
 * finché la riga stava in basso; al centro del piatto conta l'anello interno del
 * disegno, che comincia a r = 0,233 R su `blomster-2` — il più stretto dei due
 * design che accettano la scritta. La corda dentro quell'anello, all'altezza di
 * un blocco di DUE righe, vale il 19% del lato — ed è questo numero: il blocco
 * non esce dalla campitura vuota, mai, perché se non ci sta va a capo e poi
 * rimpicciolisce (ruling TL 20/9, «prendiamoci un margine più sicuro»).
 *
 * Una convenzione sola per tutti i design, come vuole la card: su `amalfi-dyr`
 * la campitura arriva a 0,318 R e ci starebbe il 30%, ma un numero per design è
 * roba della 6b.
 */
export const INSCRIPTION_MAX_WIDTH = 19;
/**
 * Corpo del testo prima del fit, in `cqmin`. Era 7: sul piatto vero leggeva
 * grosso e pesante accanto a un'arte fatta di tratti sottili (ruling TL 20/9,
 * a schermo). Poi 5 → 4,25 → 3,5, a inseguire la larghezza — e infine 4, quando
 * la riga ha imparato ad andare a capo: da lì la lunghezza non si paga più tutta
 * in corpo, si paga in righe, e una dedica lunga resta leggibile invece di
 * scendere sotto i 5px sul telefono.
 */
export const INSCRIPTION_FONT_SIZE = 4;
/**
 * Sotto questo fattore non si rimpicciolisce più: si tronca (AC 3).
 *
 * Va tenuto **sotto** `INSCRIPTION_SCALE_LONG`: è il pavimento del ciclo di
 * misura, quindi se salisse sopra la rampa il blocco partirebbe già sotto al
 * pavimento e il ciclo non potrebbe stringere di un passo — in silenzio.
 */
export const INSCRIPTION_MIN_FIT = 0.45;

/**
 * Fin qui la dedica è «corta», e prende il corpo pieno più il bonus: una parola
 * o due sul piatto stanno bene grandi, ed è il caso più comune.
 */
export const INSCRIPTION_SHORT = 8;
/**
 * Quanto è più grande una dedica corta. Ruling TL 20/9: «se ho poche lettere
 * prendiamo un carattere leggermente più grande, migliora l'esperienza».
 */
export const INSCRIPTION_SCALE_SHORT = 1.25;
/**
 * …e quanto vale alla lunghezza massima del campo. Da quando la riga può andare
 * a capo questa rampa non deve più fare tutto il lavoro: è un gusto, non un
 * vincolo — a far stare il blocco dentro il piatto ci pensa il ciclo di misura.
 */
export const INSCRIPTION_SCALE_LONG = 0.9;

/**
 * Quante righe può occupare il blocco. Due: una dedica su un piatto è una o due
 * righe, e la scatola è larga quanto la corda della campitura vuota misurata
 * all'altezza di DUE righe — con tre il blocco sarebbe più alto e la corda
 * disponibile più stretta, cioè si rincorrerebbe.
 *
 * È l'obiettivo del ciclo, non una garanzia: il ritaglio è orizzontale, quindi
 * un blocco che al pavimento vuole ancora tre righe le disegna. Succede solo
 * con parole tutte lunghissime, e a quel corpo resta dentro la campitura.
 */
export const INSCRIPTION_MAX_LINES = 2;

/** Di quanto stringe ogni passata del ciclo di misura, quando non ci sta. */
export const INSCRIPTION_SHRINK_STEP = 0.9;
/**
 * E quante passate al massimo. Da `INSCRIPTION_SCALE_SHORT` al pavimento con
 * passi del 10% ce ne vogliono 10: il ciclo si ferma prima da solo, questo è il
 * fermo di sicurezza perché una misura storta non diventi un ciclo infinito.
 */
export const INSCRIPTION_FIT_PASSES = 10;

/**
 * Quanto vale il corpo alla lunghezza data: il bonus fino a `INSCRIPTION_SHORT`,
 * poi giù in linea retta fino a `INSCRIPTION_SCALE_LONG` alla lunghezza massima
 * del campo. Legato a `MAX_CUSTOM_TEXT` e non a un 25 scritto qui, così se il
 * cap cambia la rampa lo segue invece di finire fuori scala.
 */
export function scaleForLength(length: number): number {
  if (!(length > INSCRIPTION_SHORT)) return INSCRIPTION_SCALE_SHORT;
  const span = MAX_CUSTOM_TEXT - INSCRIPTION_SHORT;
  if (span <= 0) return INSCRIPTION_SCALE_LONG;
  const over = Math.min(length, MAX_CUSTOM_TEXT) - INSCRIPTION_SHORT;
  return (
    INSCRIPTION_SCALE_SHORT -
    (over / span) * (INSCRIPTION_SCALE_SHORT - INSCRIPTION_SCALE_LONG)
  );
}

/**
 * Una passata del ciclo di misura: dato il fattore corrente e come è venuto il
 * blocco, il fattore successivo — o `null` quando non c'è più niente da fare,
 * perché il blocco sta o perché si è arrivati al pavimento (sotto il quale si
 * tronca, AC 3).
 *
 * `tooWide` è vero solo per una parola sola più larga della scatola: tutto il
 * resto va a capo. Le parole non si spezzano mai a metà (ruling TL 20/9).
 */
export function shrinkStep(
  fit: number,
  { tooWide, lines }: { tooWide: boolean; lines: number }
): number | null {
  if (!tooWide && lines <= INSCRIPTION_MAX_LINES) return null;
  const next = Math.max(INSCRIPTION_MIN_FIT, fit * INSCRIPTION_SHRINK_STEP);
  return next < fit ? next : null;
}

/**
 * Il design porta la parola come layer (il gruppo «Tekst» di Alessio, uno per
 * posizione)? Allora la scritta viva non si disegna, e non è solo un fatto di
 * pixel: è anche ciò che il testo di aiuto sotto al campo può promettere.
 * Un posto solo, così le due cose non possono divergere.
 */
export function inscriptionIsLayered(
  textGroup: TextGroupCandidate | null
): boolean {
  return textGroup !== null;
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
  if (inscriptionIsLayered(textGroup)) return false;
  return text.trim().length > 0;
}
