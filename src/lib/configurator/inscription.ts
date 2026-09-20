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
 * design che accettano la scritta. La corda dentro quell'anello, all'altezza
 * della riga, vale il 22% del lato, e 22 è questo numero: la riga non esce dalla
 * campitura vuota, mai, perché se non ci sta rimpicciolisce (ruling TL 20/9,
 * «prendiamoci un margine più sicuro»).
 *
 * Una convenzione sola per tutti i design, come vuole la card: su `amalfi-dyr`
 * la campitura arriva a 0,318 R e ci starebbe il 30%, ma un numero per design è
 * roba della 6b.
 */
export const INSCRIPTION_MAX_WIDTH = 22;
/**
 * Corpo del testo prima del fit, in `cqmin`. Era 7: sul piatto vero leggeva
 * grosso e pesante accanto a un'arte fatta di tratti sottili (ruling TL 20/9,
 * a schermo). Poi 5 → 4,25 → 3,5: a ogni giro la riga appoggiava ancora
 * sull'anello interno del disegno. 3,5 è il corpo che tiene una dedica di 14
 * caratteri dentro il 22% del lato senza doverla rimpicciolire.
 *
 * Il prezzo, che è bene sia scritto e non scoperto dopo: sul telefono il piatto
 * è 244px, quindi questo corpo vale ~8,5px, e una dedica da 25 caratteri —
 * schiacciata anche dalla rampa e poi dalla larghezza — scende intorno ai 5px.
 * Dentro l'anello e leggibile sul telefono, alla lunghezza massima, non si può
 * stare insieme: l'anello è il 22% del piatto.
 */
export const INSCRIPTION_FONT_SIZE = 3.5;
/**
 * Un filo d'aria fra la riga e il suo muro. Un fit ESATTO è il caso peggiore per
 * `text-overflow: ellipsis`: la riga finisce larga quanto la scatola al decimo
 * di pixel, e basta un arrotondamento nell'altro verso — un altro schermo, un
 * altro rapporto di pixel, un altro font caricato — perché il browser decida che
 * non ci sta e si mangi le ultime lettere con tre puntini. Misurato: 53,88px di
 * testo in 54px di scatola, 0,12px di margine. Il 3% è invisibile a occhio e
 * toglie i puntini da tutti gli schermi.
 */
export const INSCRIPTION_FIT_SLACK = 0.97;

/**
 * Sotto questo fattore non si rimpicciolisce più: si tronca (AC 3).
 *
 * Va tenuto **sotto** `INSCRIPTION_TAPER_TO`: è un pavimento applicato dopo la
 * rampa, quindi se salisse sopra di essa rialzerebbe il corpo delle dediche
 * lunghe invece di limitarsi a fermarne la discesa — in silenzio.
 */
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
  const wall = (boxWidth / textWidth) * INSCRIPTION_FIT_SLACK;
  return Math.max(INSCRIPTION_MIN_FIT, Math.min(taper, wall));
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
