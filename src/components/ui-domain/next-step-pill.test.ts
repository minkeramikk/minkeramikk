/**
 * R4-BTN-SCALE — le tre cose che possono rompersi in silenzio nella scala di
 * taglia, e nessuna di più:
 *
 *  1. `lg` deve restare la pillola di OGGI. Non "simile": le stesse classi.
 *     Il default è ciò che tiene fermi i tre call-site fuori scope (AC7).
 *  2. `sm` deve SOSTITUIRE padding e gap, non affiancarli. È l'unico punto
 *     fragile del meccanismo: dipende da tailwind-merge, non dalla CSS.
 *  3. Il gemello `max-md:` (che lo step 2 passa in className, perché una prop
 *     non ha breakpoint) deve restare allineato alla ricetta `sm`. Le due
 *     stringhe sono scritte a mano — Tailwind non vede le classi costruite a
 *     runtime — quindi l'allineamento è un test, non una promessa.
 *
 * `renderToStaticMarkup` e non un DOM: la pillola è pura — props in, markup
 * out — e una stringa basta. Nessun jsdom, nessuna testing-library.
 */
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  NextStepPill,
  PillIcon,
  PILL_SM_UNDER_MD,
} from "@/components/ui-domain/next-step-pill";

const render = (props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    h(NextStepPill, {
      icon: h(PillIcon, null, "x"),
      label: "Bygg et nytt design",
      caption: "Fullfør bestilling",
      arrow: true,
      onClick: () => {},
      ...props,
    })
  );

/** Le classi del `<button>` esterno. */
const buttonClasses = (html: string) => {
  const m = html.match(/^<button [^>]*class="([^"]*)"/);
  if (!m) throw new Error(`nessuna class sul <button>: ${html.slice(0, 120)}`);
  // ponytail: renderToStaticMarkup HTML-escapes `&` come `&amp;` negli
  // attributi (verificato: `class="[&amp;_x]:foo"`) — le ricette `sm`
  // usano `&` per il variant arbitrario Tailwind, quindi va decodificato
  // prima del confronto o nessuna classe con `&` potrebbe mai combaciare.
  return m[1].replace(/&amp;/g, "&").split(" ");
};

describe("NextStepPill · scala di taglia", () => {
  it("senza `size` rende esattamente la pillola `lg`", () => {
    expect(render()).toBe(render({ size: "lg" }));
  });

  it("`lg` è la pillola di oggi: p-3, gap-3.5, label 15px, freccetta size-9, disco size-11", () => {
    const html = render({ size: "lg" });
    const cls = buttonClasses(html);
    expect(cls).toContain("p-3");
    expect(cls).toContain("gap-3.5");
    expect(html).toContain("text-[15px]");
    expect(html).toContain("text-[11px]");
    expect(html).toContain("size-9");
    expect(html).toContain("size-11");
    // nessun override di taglia sul bottone: `lg` non aggiunge NIENTE
    expect(cls.filter((c) => c.includes("data-pill-"))).toHaveLength(0);
  });

  it("`sm` sostituisce padding e gap invece di affiancarli", () => {
    const cls = buttonClasses(render({ size: "sm" }));
    expect(cls).toContain("p-2");
    expect(cls).toContain("gap-3");
    expect(cls).not.toContain("p-3");
    expect(cls).not.toContain("gap-3.5");
  });

  it("`sm` porta la ricetta del mockup su disco, etichetta, caption e freccetta", () => {
    const cls = buttonClasses(render({ size: "sm" }));
    for (const c of [
      "[&_[data-pill-icon]]:size-8",
      "[&_[data-pill-icon]_svg]:size-4",
      "[&_[data-pill-label]]:text-[14px]",
      "[&_[data-pill-caption]]:text-[10px]",
      "[&_[data-pill-arrow]]:size-7",
      "[&_[data-pill-arrow]]:text-[15px]",
    ]) {
      expect(cls).toContain(c);
    }
  });

  it("gli agganci per attributo esistono: senza, la ricetta `sm` non colpisce niente", () => {
    const html = render({ size: "sm" });
    expect(html).toContain("data-pill-icon");
    expect(html).toContain("data-pill-arrow");
    expect(html).toContain("data-pill-label");
    expect(html).toContain("data-pill-caption");
  });

  it("PILL_SM_UNDER_MD è la ricetta `sm`, prefissata max-md:, niente di più", () => {
    const twin = PILL_SM_UNDER_MD.split(" ");
    expect(twin.every((c) => c.startsWith("max-md:"))).toBe(true);
    const stripped = twin.map((c) => c.replace("max-md:", ""));
    const smOnly = buttonClasses(render({ size: "sm" })).filter(
      (c) => !buttonClasses(render({ size: "lg" })).includes(c)
    );
    expect([...stripped].sort()).toEqual([...smOnly].sort());
  });
});
