import type { Metadata, Viewport } from "next";
import ReactDOM from "react-dom";
import { Lora, Poppins } from "next/font/google";
import { getLocale } from "next-intl/server";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { getThemeTokens } from "@/lib/theme.server";
import { AssetVariantFallback } from "@/components/asset-variant-fallback";
import { siteUrl } from "@/lib/site";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-poppins",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

/**
 * R5-TEXT-LIVE — la scritta del cliente sull'anteprima del piatto, e nient'altro
 * su questo sito. Serve un corsivo vero, con la mano dentro, non l'italico
 * inclinato di un font da interfaccia: quello che lo studio dipinge è calligrafia
 * (ruling TL 20/9, «un font che sembri più italic che un'incisione»).
 *
 * Lora e non un corsivo più decorato: sul piatto quella riga vive fra i 10 e i
 * 20px, e i corsivi eleganti ad alto contrasto (Cormorant, Tangerine) a quelle
 * misure perdono le aste sottili. Lora è disegnata per il testo e regge.
 *
 * Un peso, uno stile, sottoinsieme latino (che porta å ø æ): ~25kB, e
 * `next/font` la ospita in casa come Poppins — nessuna chiamata a Google, nessun
 * salto di layout.
 *
 * `preload: false` NON è una svista. Questa chiamata sta nel layout radice,
 * quindi senza di esso ogni pagina del sito — home, catalogo, checkout, admin —
 * emetterebbe un `<link rel="preload" as="font">` e scaricherebbe quei kB per un
 * font che può servire solo allo step 2 del configuratore, solo sui design che
 * accettano la scritta, e solo dopo che il cliente ha scritto qualcosa. La
 * variabile CSS arriva lo stesso: il font si carica quando serve davvero.
 */
const lora = Lora({
  variable: "--font-inscription",
  weight: ["500"],
  style: ["italic"],
  subsets: ["latin"],
  preload: false,
});

export const metadata: Metadata = {
  // Makes the file-based opengraph-image/twitter-image URLs absolute (required
  // for social crawlers). Origin from siteUrl() (NEXT_PUBLIC_SITE_URL override).
  metadataBase: new URL(siteUrl()),
  title: {
    default: "Min Keramikk",
    template: "%s · Min Keramikk",
  },
  description: "Håndlaget keramikk – bygg din egen design.",
  // Social share card. The image comes from src/app/opengraph-image.jpg +
  // twitter-image.jpg (Next file convention → auto og:image/twitter:image with
  // dimensions). nb_NO default; per-locale refinement can come later.
  openGraph: {
    type: "website",
    siteName: "Min Keramikk",
    title: "Min Keramikk",
    description: "Håndlaget keramikk – bygg din egen design.",
    locale: "nb_NO",
    alternateLocale: ["en"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Min Keramikk",
    description: "Håndlaget keramikk – bygg din egen design.",
  },
};

/**
 * R4-STEP2-KEYBOARD ① — `interactive-widget=resizes-content`.
 *
 * The default (`resizes-visual`) is why the inscription field on step 2 was
 * impossible to frame on Android Chrome: the LAYOUT viewport keeps its full
 * height when the keyboard comes up, so `sticky`, `svh` and every measurement
 * taken from it describe a screen that is half covered by keys, and the code
 * had to guess the difference from `visualViewport`. With this the layout
 * viewport shrinks instead, and the guessing stops.
 *
 * iOS Safari ignores it and resizes the visual viewport only — the
 * `visualViewport` correction in the configurator stays for that.
 *
 * Everything else is Next's own default meta, written out because declaring
 * `viewport` replaces it wholesale.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  // Single injection point for the 3 managed theme tokens (ADR 0008).
  const theme = await getThemeTokens();
  // F26.1: open the TLS connection to Supabase Storage before the first <img>
  // is discovered (~570ms resource load delay on the hero otherwise). No
  // crossOrigin: <img> are no-cors fetches — a crossorigin preconnect would
  // warm the wrong connection. Fonts need nothing: Poppins is self-hosted.
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    ReactDOM.preconnect(process.env.NEXT_PUBLIC_SUPABASE_URL);
  }
  return (
    <html
      lang={locale}
      className={`${poppins.variable} ${lora.variable} h-full antialiased`}
      style={{
        ["--mk-light" as string]: theme.light,
        ["--mk-dark" as string]: theme.dark,
        ["--mk-accent" as string]: theme.accent,
      }}
    >
      <body className="min-h-full flex flex-col">
        <AssetVariantFallback />
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
