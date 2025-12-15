import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Recursive Sitemap Analyzer & Source Tracker",
  description: "Crawl and analyze website sitemaps recursively",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}


