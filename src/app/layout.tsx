import type { Metadata } from "next";
import { Bitter, Shrikhand } from "next/font/google";
import { getLocale } from "next-intl/server";
import "./globals.css";

const bitter = Bitter({
  variable: "--font-bitter",
  subsets: ["latin"],
});

const shrikhand = Shrikhand({
  variable: "--font-shrikhand",
  weight: "400",
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
  return (
    <html
      lang={locale}
      className={`${bitter.variable} ${shrikhand.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
