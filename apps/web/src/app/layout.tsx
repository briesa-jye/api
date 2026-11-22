import "./globals.css";
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

// Bundled fonts, same as briesa.com.
const sans = localFont({
  src: [
    { path: "../../public/fonts/manrope-400.woff2", weight: "400" },
    { path: "../../public/fonts/manrope-500.woff2", weight: "500" },
    { path: "../../public/fonts/manrope-600.woff2", weight: "600" },
    { path: "../../public/fonts/manrope-700.woff2", weight: "700" },
    { path: "../../public/fonts/manrope-800.woff2", weight: "800" },
  ],
  variable: "--font-manrope",
});
const mono = localFont({
  src: [
    { path: "../../public/fonts/plex-mono-400.woff2", weight: "400" },
    { path: "../../public/fonts/plex-mono-500.woff2", weight: "500" },
  ],
  variable: "--font-plex",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME} | Compliance decision support for software`, template: `%s | ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  robots: { index: true, follow: true },
};
export const viewport: Viewport = { themeColor: "#242424", colorScheme: "dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU" className={`${sans.variable} ${mono.variable} dark`}>
      <body className="flex min-h-dvh flex-col">{children}</body>
    </html>
  );
}
