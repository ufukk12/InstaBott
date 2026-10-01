import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Instagram Follower Tracker — Sizi Geri Takip Etmeyenleri Keşfedin",
  description:
    "Ana Instagram şifrenizi vermeden, güvenli oturum teknolojisiyle sizi geri takip etmeyenleri, takipten çıkanları ve hayalet takipçileri saniyeler içinde tespit edin.",
  keywords: [
    "instagram takipçi analiz",
    "geri takip etmeyenler",
    "instagram follower tracker",
    "takipten çıkanlar",
  ],
  openGraph: {
    title: "Instagram Follower Tracker",
    description: "Sizi geri takip etmeyenleri saniyeler içinde keşfedin.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <head>
        {/* Google Fonts preconnect — performans için */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  );
}
