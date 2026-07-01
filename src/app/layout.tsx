import type { Metadata } from "next";
import ReactDOM from "react-dom";
import { Poppins } from "next/font/google";
import { getLocale } from "next-intl/server";
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
      className={`${poppins.variable} h-full antialiased`}
      style={{
        ["--mk-light" as string]: theme.light,
        ["--mk-dark" as string]: theme.dark,
        ["--mk-accent" as string]: theme.accent,
      }}
    >
      <body className="min-h-full flex flex-col">
        <AssetVariantFallback />
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
