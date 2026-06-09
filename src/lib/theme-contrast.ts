/**
 * Theme contrast (F11a, ADR 0008). Pure — no I/O, unit-tested. Computes the
 * DERIVED colours the way `globals.css` does (`color-mix(in oklab, …)`) and the
 * WCAG 2.1 contrast ratio, so the editor can block a save that would make the
 * site illegible. The three managed tokens drive everything else.
 */
export interface ThemeTriple {
  light: string;
  dark: string;
  accent: string;
}

export const AA_NORMAL = 4.5; // WCAG AA, normal text

type RGB = [number, number, number];

function parseHex(hex: string): RGB {
  const s = hex.replace("#", "").trim();
  const v = s.length === 3 ? s.split("").map((c) => c + c).join("") : s;
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255) as RGB;
}

function toHex(rgb: RGB): string {
  return (
    "#" +
    rgb
      .map((c) =>
        Math.round(Math.max(0, Math.min(1, c)) * 255)
          .toString(16)
          .padStart(2, "0")
      )
      .join("")
  );
}

const s2l = (c: number) =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const l2s = (c: number) =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;

function srgbToOklab([r, g, b]: RGB): RGB {
  r = s2l(r);
  g = s2l(g);
  b = s2l(b);
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);
  return [
    0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  ];
}

function oklabToSrgb([L, a, b]: RGB): RGB {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  return [
    l2s(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    l2s(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    l2s(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/** `color-mix(in oklab, a, b pctB%)` — pctB share of `b`, (100−pctB) of `a`. */
export function mixOklab(a: string, b: string, pctB: number): string {
  const A = srgbToOklab(parseHex(a));
  const B = srgbToOklab(parseHex(b));
  const t = pctB / 100;
  const mixed = A.map((v, i) => v * (1 - t) + B[i] * t) as RGB;
  return toHex(oklabToSrgb(mixed));
}

const relLum = ([r, g, b]: RGB) => {
  const [R, G, B] = [r, g, b].map(s2l);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
};

/** WCAG 2.1 contrast ratio (1–21). Order-independent. */
export function contrastRatio(fg: string, bg: string): number {
  const L1 = relLum(parseHex(fg));
  const L2 = relLum(parseHex(bg));
  const hi = Math.max(L1, L2);
  const lo = Math.min(L1, L2);
  return (hi + 0.05) / (lo + 0.05);
}

export interface ContrastPair {
  id: "text" | "accent" | "muted";
  label: string;
  fg: string;
  bg: string;
  ratio: number;
  passes: boolean;
  hint: string;
}

/** The three key derived pairs the editor guards (DESIGN-SYSTEM §3 / ADR 0008). */
export function deriveContrastPairs(t: ThemeTriple): ContrastPair[] {
  const white = "#ffffff";
  const primaryForeground = mixOklab(t.accent, white, 92); // --primary-foreground
  const mutedForeground = mixOklab(t.dark, t.light, 38); // --muted-foreground

  const defs: Omit<ContrastPair, "ratio" | "passes">[] = [
    {
      id: "text",
      label: "Body text on background",
      fg: t.dark,
      bg: t.light,
      hint: "Darken the dark colour or lighten the light colour.",
    },
    {
      id: "accent",
      label: "Button text on accent",
      fg: primaryForeground,
      bg: t.accent,
      hint: "The accent is too light for white text — pick a darker accent.",
    },
    {
      // Muted/secondary text renders on the page background — guard it there.
      id: "muted",
      label: "Muted text on background",
      fg: mutedForeground,
      bg: t.light,
      hint: "Increase the gap between the dark and light colours.",
    },
  ];

  return defs.map((d) => {
    const ratio = contrastRatio(d.fg, d.bg);
    return { ...d, ratio, passes: ratio >= AA_NORMAL };
  });
}

export interface ThemeContrastResult {
  ok: boolean;
  pairs: ContrastPair[];
  failures: ContrastPair[];
}

export function checkThemeContrast(t: ThemeTriple): ThemeContrastResult {
  const pairs = deriveContrastPairs(t);
  return { ok: pairs.every((p) => p.passes), pairs, failures: pairs.filter((p) => !p.passes) };
}
