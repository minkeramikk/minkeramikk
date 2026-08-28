/**
 * R4-POLISH — aritmetica delle corsie orizzontali dello step 2. Pura: niente
 * DOM, niente React, così il comportamento è testabile senza browser.
 *
 * Perché esiste: `scrollIntoView` scrolla OGNI antenato scrollabile, documento
 * compreso — misurato su c0bba2f, un tap su un'opzione muoveva la pagina di
 * 27-29px sotto il dito. Scrivere `scrollLeft` non può toccare nessun antenato.
 */

/** Un tap di freccia = ~80% del viewport della corsia (card R4-POLISH voce 5). */
export function arrowStep(clientWidth: number, dir: -1 | 1): number {
  return dir * Math.max(1, Math.round(clientWidth * 0.8));
}

export interface CentreInput {
  /** `lane.getBoundingClientRect().left` */
  laneLeft: number;
  /** `lane.scrollLeft` */
  laneScrollLeft: number;
  /** `lane.clientWidth` */
  laneClientWidth: number;
  /** `card.getBoundingClientRect().left` */
  cardLeft: number;
  /** `card.getBoundingClientRect().width` */
  cardWidth: number;
}

/**
 * Il nuovo `scrollLeft` che mette la card al centro della corsia, mai negativo
 * (oltre il bordo sinistro non c'è niente da mostrare). Il browser satura da sé
 * sul bordo destro.
 */
export function centreScrollLeft({
  laneLeft,
  laneScrollLeft,
  laneClientWidth,
  cardLeft,
  cardWidth,
}: CentreInput): number {
  const offsetInContent = cardLeft - laneLeft + laneScrollLeft;
  return Math.max(0, Math.round(offsetInContent - (laneClientWidth - cardWidth) / 2));
}

/**
 * R4-ARROWS — quanto spazio i dischi freccia si prendono ai bordi di uno
 * scroller. 36px di disco + 2×4px di area toccabile (`after:-inset-1`) = 44,
 * più i 4px di gronda dello scroller = 48. È il valore che `scroll-padding-inline`
 * (44px, la freccia) e `scroll-margin-inline` (4px, la gronda) sommano insieme:
 * qui serve come UN numero perché `nearestScrollLeft` lavora in pixel, non in
 * classi. Cambiando le classi, cambiare anche questo.
 */
export const ARROW_SAFE_PX = 48;

export interface NearestInput {
  /** `scroller.getBoundingClientRect().left` */
  scrollerLeft: number;
  /** `scroller.scrollLeft` */
  scrollLeft: number;
  /** `scroller.clientWidth` */
  clientWidth: number;
  /** `target.getBoundingClientRect().left` */
  targetLeft: number;
  /** `target.getBoundingClientRect().width` */
  targetWidth: number;
  /** spazio da tenere libero all'inizio (il disco ‹) */
  padStart: number;
  /** spazio da tenere libero alla fine (il disco ›) */
  padEnd: number;
}

/**
 * Il `scrollLeft` MINIMO che porta il target dentro la fascia libera fra i due
 * dischi freccia. Se ci sta già, non muove niente (ritorna lo scrollLeft
 * corrente): è l'equivalente di `inline: "nearest"`, ma senza `scrollIntoView`
 * — che scrollerebbe anche la pagina.
 *
 * Un target più largo della fascia non può stare tutto dentro: in quel caso
 * vince il suo BORDO INIZIALE, perché è lì che comincia l'etichetta da leggere.
 */
export function nearestScrollLeft({
  scrollerLeft,
  scrollLeft,
  clientWidth,
  targetLeft,
  targetWidth,
  padStart,
  padEnd,
}: NearestInput): number {
  const offset = targetLeft - scrollerLeft + scrollLeft;
  const viewStart = scrollLeft + padStart;
  const viewEnd = scrollLeft + clientWidth - padEnd;
  // troppo a sinistra (o più largo della fascia): allinea il bordo iniziale
  if (offset < viewStart || targetWidth > clientWidth - padStart - padEnd) {
    return Math.max(0, Math.round(offset - padStart));
  }
  // troppo a destra: allinea il bordo finale
  if (offset + targetWidth > viewEnd) {
    return Math.max(0, Math.round(offset + targetWidth - clientWidth + padEnd));
  }
  return scrollLeft;
}
