/**
 * R5-TEXT-LIVE (card 6a) — le parole del cliente sul piatto, mentre le scrive.
 * Estesa da R5-TEXT-POSITION (0.1-1, 0.1-6): la scritta si disegna SEMPRE dal
 * codice ora, `centre`/`top`/`bottom`/`back` — la vecchia regola «dove lo
 * studio ha già disegnato la parola come layer, non disegnare» è cancellata,
 * il gruppo «Tekst» non governa più niente (vedi `text-option.ts`).
 */
import { MAX_CUSTOM_TEXT } from "@/lib/orders/schema";

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

/** La scritta viva si disegna? Stesso cancello del campo (`acceptsCustomText`)
 *  più del testo vero e proprio — nessun'altra condizione, ora che il gruppo
 *  «Tekst» non governa più niente (0.1-1). */
export function showsLiveInscription({
  acceptsCustomText,
  text,
}: {
  acceptsCustomText: boolean;
  text: string;
}): boolean {
  if (!acceptsCustomText) return false;
  return text.trim().length > 0;
}

/**
 * R5-TEXT-POSITION (0.1-6) — geometria dell'arco Topp/Bunn, in unità del
 * `viewBox="0 0 100 100"` montato dentro lo stesso quadrato `100cqmin` del
 * centre. Raggio = 0,60 × R del piatto (R = 47,15, misurato in `inscription.ts`
 * sopra) = 28,29; il centro del piatto è 50,50 — vincolato da DS §3.33 e dalla
 * card, non da `S2-1280-Topp.dc.html` (che disegna 0,64 R sul proprio artwork).
 */
export const INSCRIPTION_ARC_RADIUS = 28.29;

/**
 * Corpo del testo sull'arco, prima del fit, in unità viewBox (100 = lato del
 * quadrato). Il mockup ha 12,5 su un viewBox 200 → 6,25 di partenza qui.
 * Misurato a 390 il 2026-09-24 (editor mobile, canvas ~300px, Krabbe con
 * `top` abilitato, 25 caratteri): 6,25 sta già dentro l'anello tratteggiato
 * senza toccare il bordo decorato — nessuna correzione necessaria.
 */
export const INSCRIPTION_ARC_FONT_SIZE = 6.25;

/**
 * Quanto dell'arco (un semicerchio, non l'intero cerchio: il testo corre solo
 * sulla metà superiore/inferiore) si può riempire prima di dover stringere.
 * 0,8: un margine ai due capi, come `INSCRIPTION_MAX_WIDTH` per la riga al
 * centro — mai tutto il semicerchio, o il testo tocca dove l'arco finisce.
 */
export const INSCRIPTION_ARC_FILL = 0.8;

/**
 * Una passata del ciclo di misura per l'arco — stesso ritmo di `shrinkStep`
 * (stesso passo `INSCRIPTION_SHRINK_STEP`, stesso pavimento
 * `INSCRIPTION_MIN_FIT`), ma il criterio è la LUNGHEZZA del `textPath`
 * (`getComputedTextLength()`, misurata dal chiamante) contro la corda
 * disponibile: `π · radius · fill`. Puro: nessun DOM qui dentro.
 */
export function arcFit(textLength: number, radius: number, fit: number): number {
  const available = Math.PI * radius * INSCRIPTION_ARC_FILL;
  if (textLength <= available) return fit;
  const next = Math.max(INSCRIPTION_MIN_FIT, fit * INSCRIPTION_SHRINK_STEP);
  return next;
}
