"use client";

import Link from "next/link";
import {
  MessageSquare,
  ArrowRight,
  ShieldCheck,
  Zap,
  Globe,
  Lock,
  Users,
  Code,
  Sparkles,
  CheckCircle2
} from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500 selection:text-white">
      {/* NAVBAR */}
      <nav className="border-b border-slate-800/80 bg-slate-950/70 backdrop-blur fixed top-0 w-full z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-tr from-indigo-600 to-sky-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-500/25">
              <MessageSquare className="w-5 h-5" />
            </div>
            <span className="text-lg font-bold tracking-tight text-white">
              LiveChat
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white transition"
            >
              Masuk Admin
            </Link>
            <Link
              href="/login"
              className="px-4 py-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition shadow-md shadow-indigo-600/30 flex items-center gap-1.5"
            >
              Portal Admin <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </nav>

      {/* HERO SECTION */}
      <section className="pt-36 pb-20 px-6 max-w-5xl mx-auto text-center flex flex-col items-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold mb-6">
          <Sparkles className="w-3.5 h-3.5" /> Generasi Baru Real-Time Obrolan Web
        </div>

        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-white max-w-3xl leading-tight">
          Sistem Live Chat Cepat, Aman &amp;{" "}
          <span className="bg-gradient-to-r from-indigo-400 via-sky-400 to-emerald-400 bg-clip-text text-transparent">
            Bisa Di-Embed Di Mana Saja
          </span>
        </h1>

        <p className="mt-6 text-base md:text-lg text-slate-400 max-w-2xl leading-relaxed">
          Hubungkan pengunjung dengan tim Anda secara instan. Hadirkan widget chat mengambang
          di website Anda atau bagikan link Room Chat publik ala Chatango dalam hitungan detik.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row items-center gap-4">
          <Link
            href="/login"
            className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-base shadow-xl shadow-indigo-600/30 transition flex items-center justify-center gap-2"
          >
            Buka Portal Admin <ArrowRight className="w-5 h-5" />
          </Link>
        </div>

        {/* Feature Badges */}
        <div className="mt-14 pt-10 border-t border-slate-900 grid grid-cols-2 md:grid-cols-4 gap-6 w-full text-left">
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80">
            <Zap className="w-5 h-5 text-amber-400 mb-2" />
            <h4 className="text-sm font-semibold text-white">Ultra Fast Latency</h4>
            <p className="text-xs text-slate-400 mt-1">
              Ditenagai Bun &amp; native WebSocket untuk respon di bawah 5 milidetik.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80">
            <Globe className="w-5 h-5 text-sky-400 mb-2" />
            <h4 className="text-sm font-semibold text-white">Mode Hybrid</h4>
            <p className="text-xs text-slate-400 mt-1">
              Widget melayang di web klien atau Room Publik ala Chatango.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80">
            <Users className="w-5 h-5 text-indigo-400 mb-2" />
            <h4 className="text-sm font-semibold text-white">Tamu &amp; Member</h4>
            <p className="text-xs text-slate-400 mt-1">
              Pengunjung bisa chat anonim atau daftar akun agar riwayat obrolan aman.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80">
            <Lock className="w-5 h-5 text-emerald-400 mb-2" />
            <h4 className="text-sm font-semibold text-white">Role-Based Guard</h4>
            <p className="text-xs text-slate-400 mt-1">
              Pemisahan ketat hak akses antara Admin Dashboard dan Pengunjung umum.
            </p>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-slate-900 py-8 text-center text-xs text-slate-500">
        <p>&copy; {new Date().getFullYear()} LiveChat. Hak Cipta Dilindungi.</p>
      </footer>
    </div>
  );
}
