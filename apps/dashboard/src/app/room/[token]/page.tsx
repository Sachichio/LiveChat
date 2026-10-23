"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import {
  MessageSquare,
  Send,
  User,
  Crown,
  Share2,
  Check,
  Shield,
  LogOut,
  KeyRound,
  UserPlus,
  Plus,
  Users
} from "lucide-react";

interface Message {
  id: string;
  sessionId: string;
  senderType: "VISITOR" | "AGENT" | "MEMBER";
  senderId: string;
  content: string;
  attachmentUrl?: string | null;
  createdAt: string;
}

export default function PublicChatRoomPage() {
  const params = useParams();
  const token = params?.token as string;

  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [session, setSession] = useState<any>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isJoined, setIsJoined] = useState(false);
  const [copied, setCopied] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Authentication & Identity State
  const [currentMember, setCurrentMember] = useState<any>(null);
  const [currentAdmin, setCurrentAdmin] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"guest" | "login" | "register" | "admin">("guest");
  const [guestName, setGuestName] = useState("");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "error" | "success" } | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const showToast = (message: string, type: "error" | "success" = "error") => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((curr) => (curr?.message === message ? null : curr));
    }, 4500);
  };

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load project info (NO auto-login, always let user choose identity)
  useEffect(() => {
    if (!token) return;

    const fetchProject = async () => {
      try {
        const res = await fetch(
          `http://localhost:4000/api/widget/init?token=${token}`
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Room chat tidak ditemukan");
        setProject(data.project);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchProject();
  }, [token]);

  // Connect WebSocket Helper
  const connectWebSocket = (sessionId: string, senderType: "MEMBER" | "VISITOR" | "AGENT", senderId: string) => {
    if (socketRef.current) socketRef.current.close();
    const ws = new WebSocket("ws://localhost:4000/ws");
    socketRef.current = ws;

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: "join",
          sessionId,
          senderType,
          senderId
        })
      );
    };

    ws.onmessage = (event) => {
      try {
        const incoming = JSON.parse(event.data);
        if (incoming.type === "new_message" && incoming.message) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === incoming.message.id)) return prev;
            return [...prev, incoming.message];
          });
        }
      } catch (e) {
        console.error("WS message error", e);
      }
    };
  };

  // --- JOIN HANDLERS ---

  // 1. Join Sebagai Member (Dengan Chat History Permanen)
  const joinRoomAsMember = async (member: any) => {
    if (!token) return;

    try {
      const res = await fetch("http://localhost:4000/api/widget/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          widgetToken: token,
          memberId: member.id,
          visitorName: member.name || member.username
        })
      });
      const data = await res.json();
      if (data.session) {
        setSession(data.session);
        setMessages(data.session.messages || []);
        setIsJoined(true);
        connectWebSocket(data.session.id, "MEMBER", member.id);
      }
    } catch (err: any) {
      showToast("Gagal menghubungkan ke sesi obrolan", "error");
    }
  };

  // 2. Join Sebagai Tamu (Anonim)
  const joinRoomAsGuest = async (name: string) => {
    if (!token) return;

    // Selalu gunakan visitorId baru jika belum ada atau buat sesi tamu terisolasi
    let visitorId = localStorage.getItem("livechat_guest_vid");
    if (!visitorId) {
      visitorId = "gst_" + Date.now().toString(36) + "_" + Math.random().toString(36).substring(2, 8);
      localStorage.setItem("livechat_guest_vid", visitorId);
    }

    try {
      const res = await fetch("http://localhost:4000/api/widget/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          widgetToken: token,
          visitorId,
          visitorName: name
        })
      });
      const data = await res.json();
      if (data.session) {
        setSession(data.session);
        setMessages(data.session.messages || []);
        setIsJoined(true);
        connectWebSocket(data.session.id, "VISITOR", visitorId);
      }
    } catch (err: any) {
      showToast("Gagal menghubungkan ke sesi obrolan", "error");
    }
  };

  // 3. Join Sebagai Admin
  const joinRoomAsAdmin = async (admin: any) => {
    if (!token) return;

    try {
      const res = await fetch("http://localhost:4000/api/widget/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          widgetToken: token,
          visitorId: "admin_" + admin.id,
          visitorName: admin.name || "Admin"
        })
      });
      const data = await res.json();
      if (data.session) {
        setSession(data.session);
        setMessages(data.session.messages || []);
        setIsJoined(true);
        connectWebSocket(data.session.id, "AGENT", admin.id);
      }
    } catch (err: any) {
      showToast("Gagal menghubungkan ke sesi obrolan", "error");
    }
  };

  // --- FORM SUBMIT ACTIONS ---

  const handleGuestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestName.trim()) return;
    localStorage.setItem("livechat_guest_name", guestName.trim());
    joinRoomAsGuest(guestName.trim());
  };

  const handleMemberLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError("");

    try {
      const res = await fetch("http://localhost:4000/api/member/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: authUsername.trim(),
          password: authPassword
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal masuk");

      localStorage.setItem("livechat_member_token", data.token);
      localStorage.setItem("livechat_member_user", JSON.stringify(data.member));
      setCurrentMember(data.member);
      setAuthPassword("");
      await joinRoomAsMember(data.member);
    } catch (err: any) {
      setAuthError(err.message || "Terjadi kesalahan koneksi");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleMemberRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError("");

    try {
      const res = await fetch("http://localhost:4000/api/member/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: authUsername.trim(),
          password: authPassword
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal mendaftar");

      localStorage.setItem("livechat_member_token", data.token);
      localStorage.setItem("livechat_member_user", JSON.stringify(data.member));
      setCurrentMember(data.member);
      setAuthPassword("");
      await joinRoomAsMember(data.member);
    } catch (err: any) {
      setAuthError(err.message || "Terjadi kesalahan koneksi");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError("");

    try {
      const res = await fetch("http://localhost:4000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: adminEmail.trim(),
          password: adminPassword
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal masuk sebagai Admin");

      localStorage.setItem("livechat_admin_token", data.token);
      localStorage.setItem("livechat_admin_user", JSON.stringify(data.user));
      setCurrentAdmin(data.user);
      setAdminPassword("");
      await joinRoomAsAdmin(data.user);
    } catch (err: any) {
      setAuthError(err.message || "Terjadi kesalahan koneksi");
    } finally {
      setAuthLoading(false);
    }
  };

  // Logout / Keluar
  const handleLogout = () => {
    localStorage.removeItem("livechat_admin_user");
    localStorage.removeItem("livechat_admin_token");
    localStorage.removeItem("livechat_member_user");
    localStorage.removeItem("livechat_member_token");
    localStorage.removeItem("livechat_guest_name");
    localStorage.removeItem("livechat_guest_vid");
    setCurrentAdmin(null);
    setCurrentMember(null);
    setGuestName("");
    setIsJoined(false);
    setSession(null);
    setMessages([]);
    if (socketRef.current) socketRef.current.close();
  };

  // Kirim Pesan
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || !session || !socketRef.current) return;

    const senderType = currentAdmin ? "AGENT" : currentMember ? "MEMBER" : "VISITOR";
    const senderId = currentAdmin
      ? currentAdmin.id
      : currentMember
      ? currentMember.id
      : (localStorage.getItem("livechat_guest_vid") || "visitor");

    socketRef.current.send(
      JSON.stringify({
        type: "message",
        sessionId: session.id,
        senderType,
        senderId,
        content: inputMessage.trim()
      })
    );

    setInputMessage("");
  };

  // Unggah Foto / Gambar (Maks 2MB)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !session || !socketRef.current) return;

    const allowedMimes = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"];
    if (!file.type || !allowedMimes.includes(file.type.toLowerCase())) {
      showToast("Format file tidak didukung! Hanya gambar (PNG, JPG, JPEG, WEBP, GIF) yang diperbolehkan.", "error");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const MAX_SIZE = 2 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      showToast("Ukuran file terlalu besar! Maksimal ukuran gambar adalah 2 MB.", "error");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("http://localhost:4000/api/upload", {
        method: "POST",
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal mengunggah file");

      const senderType = currentAdmin ? "AGENT" : currentMember ? "MEMBER" : "VISITOR";
      const senderId = currentAdmin
        ? currentAdmin.id
        : currentMember
        ? currentMember.id
        : (localStorage.getItem("livechat_guest_vid") || "visitor");

      socketRef.current.send(
        JSON.stringify({
          type: "message",
          sessionId: session.id,
          senderType,
          senderId,
          content: inputMessage.trim() || "",
          attachmentUrl: data.url
        })
      );
      setInputMessage("");
    } catch (err: any) {
      showToast(err.message || "Gagal mengunggah gambar", "error");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Loading Screen Zero Dark Flash
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center text-slate-500">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium">Menghubungkan ke ruang obrolan...</p>
      </div>
    );
  }

  // Error Screen Zero Dark Flash
  if (error || !project) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center text-slate-600 p-4 text-center">
        <div className="w-16 h-16 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mb-4 shadow-sm">
          <MessageSquare className="w-8 h-8" />
        </div>
        <h1 className="text-xl font-bold text-slate-900 mb-2">Room Tidak Ditemukan</h1>
        <p className="text-sm text-slate-500 max-w-sm">
          {error || "Tautan yang Anda tuju mungkin salah atau telah dinonaktifkan oleh pemilik ruang."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-100 text-slate-800 flex-col items-center justify-center overflow-hidden relative">
      {/* FLOATING TOAST NOTIFICATION MODERN */}
      {toast && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl border bg-white border-red-200 text-red-700">
          <div className="w-8 h-8 rounded-xl bg-red-100 flex items-center justify-center shrink-0 text-red-600 font-bold">
            ⚠️
          </div>
          <div className="text-xs sm:text-sm font-medium pr-2 max-w-sm">
            {toast.message}
          </div>
          <button
            onClick={() => setToast(null)}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      <div className="w-full max-w-4xl h-full sm:h-[94vh] flex flex-col bg-white sm:rounded-3xl border border-slate-200 shadow-xl overflow-hidden relative">
        
        {/* HEADER ROOM */}
        <div className="px-6 py-4 bg-white/90 backdrop-blur-md border-b border-slate-200 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-md shadow-indigo-500/20">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900 text-base flex items-center gap-2">
                {project.name}
                <span className="text-[11px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full">
                  Support Edition
                </span>
              </h2>
              <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Live Support Room
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isJoined && (
              <div className="flex items-center gap-2 mr-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
                {currentAdmin ? (
                  <span className="text-xs text-amber-700 font-bold flex items-center gap-1.5">
                    <Crown className="w-3.5 h-3.5 text-amber-600" /> {currentAdmin.name || "Admin"}
                  </span>
                ) : currentMember ? (
                  <span className="text-xs text-emerald-700 font-semibold flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-emerald-600" /> @{currentMember.username}
                  </span>
                ) : (
                  <span className="text-xs text-slate-700 font-medium flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-slate-400" /> {guestName} (Tamu)
                  </span>
                )}
                <button
                  onClick={handleLogout}
                  title="Ganti Identitas / Keluar"
                  className="text-slate-400 hover:text-red-500 transition ml-1"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <button
              onClick={handleCopyLink}
              title="Bagikan Tautan Room"
              className="p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 transition flex items-center gap-1.5 text-xs font-medium border border-slate-200 shadow-sm"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Share2 className="w-4 h-4" />}
              <span className="hidden sm:inline">{copied ? "Tersalin!" : "Bagikan"}</span>
            </button>
          </div>
        </div>

        {/* IDENTITY FORM CARD JIKA BELUM BERGABUNG */}
        {!isJoined ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center z-10 bg-slate-50/50">
            <div className="w-full max-w-md bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xl">
              
              {/* Tab Selector (Tamu | Masuk | Daftar | Admin) */}
              <div className="grid grid-cols-4 p-1 bg-slate-100 rounded-2xl mb-6 border border-slate-200 gap-1">
                <button
                  type="button"
                  onClick={() => { setActiveTab("guest"); setAuthError(""); }}
                  className={`py-2 text-[11px] font-semibold rounded-xl transition flex items-center justify-center gap-1 ${
                    activeTab === "guest"
                      ? "bg-white text-indigo-600 shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <User className="w-3.5 h-3.5" /> Tamu
                </button>
                <button
                  type="button"
                  onClick={() => { setActiveTab("login"); setAuthError(""); }}
                  className={`py-2 text-[11px] font-semibold rounded-xl transition flex items-center justify-center gap-1 ${
                    activeTab === "login"
                      ? "bg-white text-indigo-600 shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <KeyRound className="w-3.5 h-3.5" /> Masuk
                </button>
                <button
                  type="button"
                  onClick={() => { setActiveTab("register"); setAuthError(""); }}
                  className={`py-2 text-[11px] font-semibold rounded-xl transition flex items-center justify-center gap-1 ${
                    activeTab === "register"
                      ? "bg-white text-indigo-600 shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <UserPlus className="w-3.5 h-3.5" /> Daftar
                </button>
                <button
                  type="button"
                  onClick={() => { setActiveTab("admin"); setAuthError(""); }}
                  className={`py-2 text-[11px] font-semibold rounded-xl transition flex items-center justify-center gap-1 ${
                    activeTab === "admin"
                      ? "bg-amber-600 text-white shadow-sm"
                      : "text-amber-700/80 hover:text-amber-800"
                  }`}
                >
                  <Crown className="w-3.5 h-3.5" /> Admin
                </button>
              </div>

              {authError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 text-left">
                  ⚠️ {authError}
                </div>
              )}

              {/* Form 1: Tamu */}
              {activeTab === "guest" && (
                <form onSubmit={handleGuestSubmit} className="space-y-4 text-left">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Nama Panggilan Tamu
                    </label>
                    <input
                      type="text"
                      required
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      placeholder="cth: Budi, Traveler, Anonim"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-sm"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm transition shadow-md shadow-indigo-600/20"
                  >
                    Masuk ke Ruang Obrolan
                  </button>
                </form>
              )}

              {/* Form 2: Masuk Member */}
              {activeTab === "login" && (
                <form onSubmit={handleMemberLogin} className="space-y-4 text-left">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Username Member
                    </label>
                    <input
                      type="text"
                      required
                      value={authUsername}
                      onChange={(e) => setAuthUsername(e.target.value)}
                      placeholder="cth: budisantoso"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Kata Sandi
                    </label>
                    <input
                      type="password"
                      required
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-sm"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={authLoading}
                    className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm transition shadow-md shadow-indigo-600/20 disabled:opacity-50"
                  >
                    {authLoading ? "Memverifikasi..." : "Masuk Akun Member"}
                  </button>
                </form>
              )}

              {/* Form 3: Daftar Member */}
              {activeTab === "register" && (
                <form onSubmit={handleMemberRegister} className="space-y-4 text-left">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Pilih Username Member
                    </label>
                    <input
                      type="text"
                      required
                      value={authUsername}
                      onChange={(e) => setAuthUsername(e.target.value)}
                      placeholder="cth: budisantoso"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Buat Kata Sandi
                    </label>
                    <input
                      type="password"
                      required
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      placeholder="Minimal 6 karakter"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-sm"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={authLoading}
                    className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm transition shadow-md shadow-indigo-600/20 disabled:opacity-50"
                  >
                    {authLoading ? "Mendaftarkan..." : "Daftar Akun & Gabung"}
                  </button>
                </form>
              )}

              {/* Form 4: Login Admin */}
              {activeTab === "admin" && (
                <form onSubmit={handleAdminLogin} className="space-y-4 text-left">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Email Admin
                    </label>
                    <input
                      type="email"
                      required
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      placeholder="admin@example.com"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Kata Sandi Admin
                    </label>
                    <input
                      type="password"
                      required
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white text-sm"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={authLoading}
                    className="w-full py-3 px-4 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-sm transition shadow-md shadow-amber-600/20 disabled:opacity-50"
                  >
                    {authLoading ? "Memverifikasi..." : "Masuk Sebagai Admin"}
                  </button>
                </form>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* MESSAGES FEED IN LIGHT MODE */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 bg-slate-50/50">
              {/* BANNER EDUKASI: SIMPAN RIWAYAT CHAT */}
              {!currentMember && !currentAdmin && (
                <div className="bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-100 rounded-2xl p-3 px-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-indigo-900 shadow-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-base">💡</span>
                    <span>
                      Mengobrol sebagai <strong>{guestName || "Tamu"}</strong>. Ingin riwayat chat ini tersimpan permanen?
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsJoined(false);
                      setActiveTab("register");
                    }}
                    className="shrink-0 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl transition shadow-sm text-[11px]"
                  >
                    Daftar Member Gratis →
                  </button>
                </div>
              )}
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 text-sm">
                  <MessageSquare className="w-10 h-10 mb-2 stroke-1 text-slate-300" />
                  <p>Belum ada riwayat pesan di ruang chat ini.</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Kirim pesan pertama untuk memulai obrolan!
                  </p>
                </div>
              ) : (
                messages.map((m) => {
                  const isAgent = m.senderType === "AGENT";
                  const isMember = m.senderType === "MEMBER";
                  const isMe =
                    (currentAdmin && m.senderType === "AGENT" && m.senderId === currentAdmin.id) ||
                    (currentMember && m.senderType === "MEMBER" && m.senderId === currentMember.id) ||
                    (!currentAdmin &&
                      !currentMember &&
                      m.senderType === "VISITOR" &&
                      typeof window !== "undefined" &&
                      m.senderId === localStorage.getItem("livechat_guest_vid"));

                  return (
                    <div
                      key={m.id}
                      className={`flex gap-3 ${
                        isMe ? "justify-end" : "justify-start"
                      }`}
                    >
                      {!isMe && (
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 shadow-sm ${
                            isAgent
                              ? "bg-amber-500 text-white"
                              : isMember
                              ? "bg-emerald-600 text-white"
                              : "bg-slate-200 text-slate-600"
                          }`}
                        >
                          {isAgent ? (
                            <Crown className="w-4 h-4" />
                          ) : isMember ? (
                            <Shield className="w-4 h-4" />
                          ) : (
                            <User className="w-4 h-4" />
                          )}
                        </div>
                      )}

                      <div className={`max-w-md ${isMe ? "items-end" : "items-start"}`}>
                        <div className="flex items-center gap-2 mb-1 px-1">
                          {isAgent ? (
                            <span className="text-xs font-bold text-amber-600 flex items-center gap-1">
                              <Crown className="w-3 h-3 text-amber-500" /> Admin / Operator
                            </span>
                          ) : isMember ? (
                            <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                              <Shield className="w-3 h-3 text-emerald-500" /> Member
                            </span>
                          ) : (
                            <span className="text-xs font-medium text-slate-500">
                              {isMe ? "Anda (Tamu)" : "Pengunjung (Tamu)"}
                            </span>
                          )}
                          <span className="text-[10px] text-slate-400">
                            {new Date(m.createdAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit"
                            })}
                          </span>
                        </div>

                        <div
                          className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm ${
                            isMe
                              ? "bg-indigo-600 text-white rounded-tr-none"
                              : "bg-white text-slate-800 border border-slate-200 rounded-tl-none"
                          }`}
                        >
                          {m.attachmentUrl && (
                            <div className="mb-2">
                              <img
                                src={m.attachmentUrl}
                                alt="Lampiran"
                                onClick={() => setLightboxImg(m.attachmentUrl!)}
                                className="rounded-lg max-h-64 max-w-full object-cover border border-slate-200 hover:opacity-90 transition cursor-pointer shadow-sm"
                                title="Klik untuk memperbesar"
                              />
                            </div>
                          )}
                          {m.content && <div>{m.content}</div>}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* INPUT BAR LIGHT MODE */}
            <div className="p-4 bg-white border-t border-slate-200">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                className="hidden"
              />
              <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                  title="Unggah Foto / Gambar (Maks 2MB)"
                  className="p-3 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl text-slate-600 hover:text-slate-900 transition flex items-center justify-center shrink-0 disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                </button>
                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder={
                    uploading
                      ? "Sedang mengunggah gambar (maks 2MB)..."
                      : `Tulis pesan sebagai ${
                          currentAdmin
                            ? currentAdmin.name || "Admin"
                            : currentMember
                            ? `@${currentMember.username}`
                            : guestName || "Tamu"
                        }...`
                  }
                  disabled={uploading}
                  className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-sm disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={(!inputMessage.trim() && !uploading) || uploading}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-6 py-3 rounded-xl flex items-center gap-2 font-medium text-sm transition shadow-md shadow-indigo-600/20 shrink-0"
                >
                  <Send className="w-4 h-4" />
                  <span className="hidden sm:inline">Kirim</span>
                </button>
              </form>
            </div>
          </>
        )}
      </div>

      {/* Lightbox Pop-up Modal Gambar */}
      {lightboxImg && (
        <div
          className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setLightboxImg(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center">
            <button
              type="button"
              onClick={() => setLightboxImg(null)}
              className="absolute -top-10 right-0 text-white/90 hover:text-white text-xs bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-full transition flex items-center gap-1 font-medium cursor-pointer"
            >
              ✕ Tutup (Klik luar untuk menutup)
            </button>
            <img
              src={lightboxImg}
              alt="Pratinjau Gambar"
              className="max-w-full max-h-[85vh] rounded-xl object-contain cursor-default shadow-2xl border border-white/10"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
}
