import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import { getLocale } from "next-intl/server";
import { getThemeTokens } from "@/lib/theme.server";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-poppins",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Min Keramikk",
    template: "%s · Min Keramikk",
  },
  description: "Håndlaget keramikk – bygg din egen design.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  // Single injection point for the 3 managed theme tokens (ADR 0008).
  const theme = await getThemeTokens();
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
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
