import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OutLoud Deck | Public Speaking Topic Generator",
  description:
    "A smarter random topic deck for practicing public speaking, clarity, confidence, and conversation flow.",
  openGraph: {
    title: "OutLoud Deck",
    description:
      "Pick the uncomfortable topic. Speak it clean with a smarter public speaking deck.",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "OutLoud Deck public speaking topic generator preview",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "OutLoud Deck",
    description:
      "Pick the uncomfortable topic. Speak it clean with a smarter public speaking deck.",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
