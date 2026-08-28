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
