import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Lobbio Support - Realtime Customer Care & Live Chat Bisnis",
  description: "Platform live chat bisnis dan helpdesk real-time berkecepatan tinggi untuk meningkatkan kepuasan pelanggan dan konversi penjualan.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body className="min-h-screen bg-slate-50 antialiased">{children}</body>
    </html>
  );
}
