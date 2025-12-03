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
  // For static export (Firebase Hosting), we cannot use headers() or cookies() server-side.
  // Wagmi will hydration on the client side.
  const cookies = null; 

  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`}>
      <body suppressHydrationWarning>
        <Providers cookies={cookies}>{children}</Providers>
      </body>
    </html>
  );
}
