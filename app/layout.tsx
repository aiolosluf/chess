import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "棋局复盘训练台",
  description: "Upload PGNs, analyze mistakes with Stockfish, and drill random puzzles.",
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
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
