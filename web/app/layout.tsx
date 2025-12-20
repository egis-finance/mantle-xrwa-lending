// Root layout. Dynamic SDK v4.50+ injects styles via shadow DOM, so no separate
// CSS import is required for the wallet widget. See ARCHITECTURE.md for details.

import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans" });
const serif = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-serif",
  weight: ["400", "600", "700"]
});

export const metadata: Metadata = {
  title: "Egis Finance",
  description: "Real-world assets as verified collateral for DeFi.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`}>
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
