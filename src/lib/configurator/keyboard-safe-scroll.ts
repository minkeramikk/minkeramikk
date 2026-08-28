/**
 * R4-POLISH voci 2+8 — di quanto va scrollata la pagina perché un campo resti
 * visibile SOPRA la tastiera software.
 *
 * `scrollIntoView({block:"center"})` centra contro il viewport di LAYOUT, che
 * la tastiera non rimpicciolisce: su iPhone il campo finisce sotto i tasti.
 * Qui si ragiona sul viewport VISUALE (`window.visualViewport`), e si tiene
 * conto anche di ciò che sta sopra — header ink sticky + canvas sticky — con
 * `marginTop`.
 *
 * Pura: niente DOM, niente React. Coordinate in pixel di viewport visuale.
 */
export interface KeyboardSafeInput {
  /** `field.getBoundingClientRect().top` (coordinate di layout) */
  fieldTop: number;
  /** `field.getBoundingClientRect().bottom` */
  fieldBottom: number;
  /** `visualViewport.offsetTop` — quanto il viewport visuale è già scorso */
  viewportTop: number;
  /** `visualViewport.height` — l'altezza LIBERA, tastiera esclusa */
  viewportHeight: number;
  /** spazio occupato in alto da header + canvas sticky */
  marginTop: number;
  /** aria sotto il campo, perché non tocchi il bordo della tastiera */
  marginBottom: number;
}

/**
 * Positivo = scrollare in giù (`window.scrollBy`), negativo = in su, 0 = fermi.
 * Se il campo è più alto della striscia libera si allinea il suo BORDO ALTO:
 * meglio vedere l'inizio di quello che si scrive che la fine.
 */
export function keyboardSafeScrollDelta({
  fieldTop,
  fieldBottom,
  viewportTop,
  viewportHeight,
  marginTop,
  marginBottom,
}: KeyboardSafeInput): number {
  const top = fieldTop - viewportTop;
  const bottom = fieldBottom - viewportTop;
  const safeTop = marginTop;
  const safeBottom = viewportHeight - marginBottom;

  if (top < safeTop) return Math.round(top - safeTop);
  if (bottom > safeBottom) {
    // campo più alto della striscia: il bordo alto vince
    const delta = Math.min(bottom - safeBottom, top - safeTop);
    return Math.round(delta);
  }
  return 0;
}
