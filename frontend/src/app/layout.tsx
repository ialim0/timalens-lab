import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "TimaLens Lab",
  description: "Upload an electricity lesson, get an interactive 2D/3D lab guided by Tima · Téléverse un cours d'électricité, obtiens un laboratoire interactif 2D/3D guidé par Tima.",
  icons: { icon: "/img/timalens-icon.png" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" translate="no">
      <body>{children}</body>
    </html>
  );
}
