import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "LiveChat Dashboard - Realtime Support",
  description: "Dashboard manajemen obrolan live chat dan pengaturan widget.",
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
