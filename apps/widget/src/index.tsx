import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";

// Dapatkan konfigurasi dari script tag
const currentScript =
  document.currentScript ||
  (function () {
    const scripts = document.getElementsByTagName("script");
    return scripts[scripts.length - 1];
  })();

const WIDGET_TOKEN = currentScript?.getAttribute("data-token") || "";
const API_BASE = "http://localhost:4000";
const WS_BASE = "ws://localhost:4000/ws";

interface Message {
  id: string;
  sessionId: string;
  senderType: "VISITOR" | "MEMBER" | "AGENT";
  senderId: string;
  content: string;
  attachmentUrl?: string | null;
  createdAt: string;
}

function LiveChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [session, setSession] = useState<any>(null);

  // Status Keanggotaan & Form
  const [isJoined, setIsJoined] = useState(false);
  const [activeTab, setActiveTab] = useState<"guest" | "login" | "register" | "admin">("guest");
  const [currentMember, setCurrentMember] = useState<any>(null);
  const [currentAdmin, setCurrentAdmin] = useState<any>(null);

  // Form Fields
  const [guestName, setGuestName] = useState("");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isOpen]);

  // WebSocket Connection Helper
  const connectWebSocket = (sessionId: string, senderType: "MEMBER" | "VISITOR" | "AGENT", senderId: string) => {
    if (socketRef.current) socketRef.current.close();
    const ws = new WebSocket(WS_BASE);
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
        console.error("WS error:", e);
      }
    };
  };

  // 1. Gabung Sebagai Member
  const joinAsMember = async (member: any) => {
    if (!WIDGET_TOKEN) return;
    try {
      const res = await fetch(`${API_BASE}/api/widget/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          widgetToken: WIDGET_TOKEN,
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
    } catch (err) {
      console.error("Join as member error:", err);
      setErrorToast("Gagal menghubungkan ke sesi chat");
    }
  };

  // 2. Gabung Sebagai Tamu (Anonim)
  const joinAsGuest = async (name: string) => {
    if (!WIDGET_TOKEN) return;

    let visitorId = localStorage.getItem("livechat_guest_vid");
    if (!visitorId) {
      visitorId = "gst_" + Date.now().toString(36) + "_" + Math.random().toString(36).substring(2, 8);
      localStorage.setItem("livechat_guest_vid", visitorId);
    }

    try {
      const res = await fetch(`${API_BASE}/api/widget/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          widgetToken: WIDGET_TOKEN,
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
    } catch (err) {
      console.error("Join as guest error:", err);
      setErrorToast("Gagal menghubungkan ke sesi chat");
    }
  };

  // 3. Gabung Sebagai Admin
  const joinAsAdmin = async (admin: any) => {
    if (!WIDGET_TOKEN) return;

    try {
      const res = await fetch(`${API_BASE}/api/widget/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          widgetToken: WIDGET_TOKEN,
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
    } catch (err) {
      console.error("Join as admin error:", err);
      setErrorToast("Gagal menghubungkan ke sesi chat");
    }
  };

  // Buka / Tutup Widget (Tanpa auto-login: selalu mulai dari pemilihan identitas jika belum joined)
  const handleToggle = () => {
    setIsOpen(!isOpen);
  };

  // Handle Form Tamu
  const handleGuestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestName.trim()) return;
    localStorage.setItem("livechat_guest_name", guestName.trim());
    joinAsGuest(guestName.trim());
  };

  // Handle Form Member Login
  const handleMemberLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError("");

    try {
      const res = await fetch(`${API_BASE}/api/member/login`, {
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
      await joinAsMember(data.member);
    } catch (err: any) {
      setAuthError(err.message || "Terjadi kesalahan jaringan");
    } finally {
      setAuthLoading(false);
    }
  };

  // Handle Form Member Register
  const handleMemberRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError("");

    try {
      const res = await fetch(`${API_BASE}/api/member/register`, {
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
      await joinAsMember(data.member);
    } catch (err: any) {
      setAuthError(err.message || "Terjadi kesalahan jaringan");
    } finally {
      setAuthLoading(false);
    }
  };

  // Handle Form Admin Login
  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError("");

    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
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
      await joinAsAdmin(data.user);
    } catch (err: any) {
      setAuthError(err.message || "Terjadi kesalahan jaringan");
    } finally {
      setAuthLoading(false);
    }
  };

  // Logout / Ganti Identitas
  const handleLogout = () => {
    localStorage.removeItem("livechat_admin_token");
    localStorage.removeItem("livechat_admin_user");
    localStorage.removeItem("livechat_member_token");
    localStorage.removeItem("livechat_member_user");
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
    if (!inputValue.trim() || !session || !socketRef.current) return;

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
        content: inputValue.trim()
      })
    );

    setInputValue("");
  };

  // Upload file attachment (max 2MB, image only)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !session || !socketRef.current) return;

    const allowedMimes = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"];
    if (!file.type || !allowedMimes.includes(file.type.toLowerCase())) {
      setErrorToast("Format file tidak didukung! Hanya gambar (PNG, JPG, JPEG, WEBP, GIF) yang diperbolehkan.");
      e.target.value = "";
      return;
    }

    const MAX_SIZE = 2 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setErrorToast("Ukuran file terlalu besar! Maksimal ukuran gambar adalah 2 MB.");
      e.target.value = "";
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${API_BASE}/api/upload`, {
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
          content: inputValue.trim() || "",
          attachmentUrl: data.url
        })
      );
      setInputValue("");
    } catch (err: any) {
      setErrorToast(err.message || "Gagal mengunggah gambar");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        bottom: "20px",
        right: "20px",
        zIndex: 999999,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        pointerEvents: "none"
      }}
    >
      {/* CHAT WINDOW */}
      {isOpen && (
        <div
          style={{
            width: "360px",
            height: "520px",
            backgroundColor: "#ffffff",
            borderRadius: "18px",
            boxShadow: "0 12px 36px rgba(0, 0, 0, 0.18)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            marginBottom: "16px",
            border: "1px solid #e2e8f0",
            pointerEvents: "auto"
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "14px 18px",
              backgroundColor: "#4f46e5",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between"
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <h4 style={{ margin: 0, fontSize: "15px", fontWeight: "bold", letterSpacing: "-0.01em" }}>Lobbio Support</h4>
                <span style={{ fontSize: "10px", backgroundColor: "rgba(255,255,255,0.2)", padding: "2px 7px", borderRadius: "10px", fontWeight: "600" }}>
                  Support
                </span>
                {currentAdmin && (
                  <span style={{ fontSize: "10px", backgroundColor: "#f59e0b", padding: "1px 6px", borderRadius: "10px", fontWeight: "bold" }}>
                    👑 Admin
                  </span>
                )}
                {currentMember && (
                  <span style={{ fontSize: "10px", backgroundColor: "#10b981", padding: "1px 6px", borderRadius: "10px", fontWeight: "bold" }}>
                    👤 {currentMember.username}
                  </span>
                )}
              </div>
              <p style={{ margin: "3px 0 0 0", fontSize: "11px", opacity: 0.9 }}>
                {!isJoined ? "Pilih identitas untuk bergabung" : "Live Chat Support Room"}
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {isJoined && (
                <button
                  onClick={handleLogout}
                  title="Keluar / Ganti Akun"
                  style={{
                    background: "rgba(255,255,255,0.2)",
                    border: "none",
                    color: "#ffffff",
                    fontSize: "11px",
                    padding: "3px 8px",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontWeight: "500"
                  }}
                >
                  Keluar
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                aria-label="Tutup Chat"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#ffffff",
                  fontSize: "18px",
                  cursor: "pointer",
                  lineHeight: 1
                }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Body Content */}
          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", backgroundColor: "#f8fafc" }}>
            {errorToast && (
              <div
                style={{
                  backgroundColor: "#fef2f2",
                  color: "#b91c1c",
                  fontSize: "11px",
                  padding: "8px 12px",
                  borderBottom: "1px solid #fecaca",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between"
                }}
              >
                <span>⚠️ {errorToast}</span>
                <button
                  type="button"
                  onClick={() => setErrorToast(null)}
                  style={{ background: "none", border: "none", color: "#b91c1c", cursor: "pointer", fontSize: "14px" }}
                >
                  ✕
                </button>
              </div>
            )}

            {!isJoined ? (
              <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
                {/* 4 Mode Selector Tabs: Tamu | Masuk | Daftar | Admin */}
                <div
                  style={{
                    display: "flex",
                    backgroundColor: "#f1f5f9",
                    borderRadius: "10px",
                    padding: "2px",
                    gap: "2px"
                  }}
                >
                  <button
                    type="button"
                    onClick={() => { setActiveTab("guest"); setAuthError(""); }}
                    style={{
                      flex: 1,
                      padding: "6px 2px",
                      fontSize: "11px",
                      fontWeight: "bold",
                      borderRadius: "7px",
                      border: "none",
                      backgroundColor: activeTab === "guest" ? "#ffffff" : "transparent",
                      color: activeTab === "guest" ? "#4f46e5" : "#64748b",
                      cursor: "pointer",
                      boxShadow: activeTab === "guest" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                      transition: "all 0.15s ease"
                    }}
                  >
                    Tamu
                  </button>
                  <button
                    type="button"
                    onClick={() => { setActiveTab("login"); setAuthError(""); }}
                    style={{
                      flex: 1,
                      padding: "6px 2px",
                      fontSize: "11px",
                      fontWeight: "bold",
                      borderRadius: "7px",
                      border: "none",
                      backgroundColor: activeTab === "login" ? "#ffffff" : "transparent",
                      color: activeTab === "login" ? "#4f46e5" : "#64748b",
                      cursor: "pointer",
                      boxShadow: activeTab === "login" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                      transition: "all 0.15s ease"
                    }}
                  >
                    Masuk
                  </button>
                  <button
                    type="button"
                    onClick={() => { setActiveTab("register"); setAuthError(""); }}
                    style={{
                      flex: 1,
                      padding: "6px 2px",
                      fontSize: "11px",
                      fontWeight: "bold",
                      borderRadius: "7px",
                      border: "none",
                      backgroundColor: activeTab === "register" ? "#ffffff" : "transparent",
                      color: activeTab === "register" ? "#4f46e5" : "#64748b",
                      cursor: "pointer",
                      boxShadow: activeTab === "register" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                      transition: "all 0.15s ease"
                    }}
                  >
                    Daftar
                  </button>
                  <button
                    type="button"
                    onClick={() => { setActiveTab("admin"); setAuthError(""); }}
                    style={{
                      flex: 1,
                      padding: "6px 2px",
                      fontSize: "11px",
                      fontWeight: "bold",
                      borderRadius: "7px",
                      border: "none",
                      backgroundColor: activeTab === "admin" ? "#d97706" : "transparent",
                      color: activeTab === "admin" ? "#ffffff" : "#b45309",
                      cursor: "pointer",
                      boxShadow: activeTab === "admin" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                      transition: "all 0.15s ease"
                    }}
                  >
                    Admin
                  </button>
                </div>

                {authError && (
                  <div style={{ backgroundColor: "#fee2e2", color: "#b91c1c", padding: "8px 12px", borderRadius: "8px", fontSize: "12px", marginBottom: "4px" }}>
                    ⚠️ {authError}
                  </div>
                )}

                {/* TAB 1: TAMU (IMAGE 2 DESIGN) */}
                {activeTab === "guest" && (
                  <form onSubmit={handleGuestSubmit} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div style={{ textAlign: "left" }}>
                      <p style={{ margin: 0, fontSize: "12px", color: "#475569" }}>
                        Masuk cepat tanpa password:
                      </p>
                    </div>
                    <input
                      type="text"
                      required
                      placeholder="Nama panggilan Anda..."
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      style={{
                        padding: "10px 12px",
                        borderRadius: "8px",
                        border: "1px solid #cbd5e1",
                        fontSize: "13px",
                        outline: "none",
                        backgroundColor: "#ffffff"
                      }}
                    />
                    <button
                      type="submit"
                      style={{
                        padding: "10px",
                        borderRadius: "8px",
                        border: "none",
                        backgroundColor: "#4f46e5",
                        color: "#ffffff",
                        fontWeight: "bold",
                        cursor: "pointer",
                        fontSize: "13px",
                        boxShadow: "0 4px 12px rgba(79, 70, 229, 0.25)"
                      }}
                    >
                      Mulai Mengobrol →
                    </button>
                  </form>
                )}

                {/* TAB 2: MEMBER LOGIN */}
                {activeTab === "login" && (
                  <form onSubmit={handleMemberLogin} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div style={{ textAlign: "left", marginBottom: "2px" }}>
                      <p style={{ margin: 0, fontSize: "13px", color: "#475569", fontWeight: "600" }}>
                        Masuk Akun Member:
                      </p>
                    </div>
                    <input
                      type="text"
                      required
                      placeholder="Username Member..."
                      value={authUsername}
                      onChange={(e) => setAuthUsername(e.target.value)}
                      style={{
                        padding: "10px 14px",
                        borderRadius: "10px",
                        border: "1px solid #cbd5e1",
                        fontSize: "13px",
                        outline: "none",
                        backgroundColor: "#ffffff"
                      }}
                    />
                    <input
                      type="password"
                      required
                      placeholder="Kata Sandi..."
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      style={{
                        padding: "10px 14px",
                        borderRadius: "10px",
                        border: "1px solid #cbd5e1",
                        fontSize: "13px",
                        outline: "none",
                        backgroundColor: "#ffffff"
                      }}
                    />
                    <button
                      type="submit"
                      disabled={authLoading}
                      style={{
                        padding: "11px",
                        borderRadius: "10px",
                        border: "none",
                        backgroundColor: "#4f46e5",
                        color: "#ffffff",
                        fontWeight: "bold",
                        cursor: "pointer",
                        fontSize: "13px",
                        opacity: authLoading ? 0.7 : 1,
                        boxShadow: "0 4px 12px rgba(79, 70, 229, 0.25)"
                      }}
                    >
                      {authLoading ? "Memverifikasi..." : "Masuk Member →"}
                    </button>
                  </form>
                )}

                {/* TAB 3: MEMBER REGISTER */}
                {activeTab === "register" && (
                  <form onSubmit={handleMemberRegister} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div style={{ textAlign: "left", marginBottom: "2px" }}>
                      <p style={{ margin: 0, fontSize: "13px", color: "#475569", fontWeight: "600" }}>
                        Daftar Akun Member Baru:
                      </p>
                    </div>
                    <input
                      type="text"
                      required
                      placeholder="Username yang diinginkan..."
                      value={authUsername}
                      onChange={(e) => setAuthUsername(e.target.value)}
                      style={{
                        padding: "10px 14px",
                        borderRadius: "10px",
                        border: "1px solid #cbd5e1",
                        fontSize: "13px",
                        outline: "none",
                        backgroundColor: "#ffffff"
                      }}
                    />
                    <input
                      type="password"
                      required
                      placeholder="Kata Sandi (min 6 karakter)..."
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      style={{
                        padding: "10px 14px",
                        borderRadius: "10px",
                        border: "1px solid #cbd5e1",
                        fontSize: "13px",
                        outline: "none",
                        backgroundColor: "#ffffff"
                      }}
                    />
                    <button
                      type="submit"
                      disabled={authLoading}
                      style={{
                        padding: "11px",
                        borderRadius: "10px",
                        border: "none",
                        backgroundColor: "#10b981",
                        color: "#ffffff",
                        fontWeight: "bold",
                        cursor: "pointer",
                        fontSize: "13px",
                        opacity: authLoading ? 0.7 : 1,
                        boxShadow: "0 4px 12px rgba(16, 185, 129, 0.25)"
                      }}
                    >
                      {authLoading ? "Mendaftarkan..." : "Daftar Akun Member →"}
                    </button>
                  </form>
                )}

                {/* TAB 4: ADMIN LOGIN */}
                {activeTab === "admin" && (
                  <form onSubmit={handleAdminLogin} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div style={{ textAlign: "left", marginBottom: "2px" }}>
                      <p style={{ margin: 0, fontSize: "13px", color: "#b45309", fontWeight: "600" }}>
                        Masuk Sebagai Admin / CS:
                      </p>
                    </div>
                    <input
                      type="email"
                      required
                      placeholder="Email Admin..."
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      style={{
                        padding: "10px 14px",
                        borderRadius: "10px",
                        border: "1px solid #cbd5e1",
                        fontSize: "13px",
                        outline: "none",
                        backgroundColor: "#ffffff"
                      }}
                    />
                    <input
                      type="password"
                      required
                      placeholder="Kata Sandi..."
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      style={{
                        padding: "10px 14px",
                        borderRadius: "10px",
                        border: "1px solid #cbd5e1",
                        fontSize: "13px",
                        outline: "none",
                        backgroundColor: "#ffffff"
                      }}
                    />
                    <button
                      type="submit"
                      disabled={authLoading}
                      style={{
                        padding: "11px",
                        borderRadius: "10px",
                        border: "none",
                        backgroundColor: "#d97706",
                        color: "#ffffff",
                        fontWeight: "bold",
                        cursor: "pointer",
                        fontSize: "13px",
                        opacity: authLoading ? 0.7 : 1,
                        boxShadow: "0 4px 12px rgba(217, 119, 6, 0.25)"
                      }}
                    >
                      {authLoading ? "Memverifikasi..." : "Masuk Sebagai Admin →"}
                    </button>
                  </form>
                )}
              </div>
            ) : (
              /* CHAT MESSAGES */
              <div style={{ padding: "14px", display: "flex", flexDirection: "column", gap: "10px" }}>
                {/* BANNER EDUKASI CONVERT TO MEMBER */}
                {!currentMember && !currentAdmin && (
                  <div
                    style={{
                      backgroundColor: "#eef2ff",
                      border: "1px solid #e0e7ff",
                      borderRadius: "10px",
                      padding: "8px 10px",
                      fontSize: "11px",
                      color: "#3730a3",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "6px"
                    }}
                  >
                    <span>💡 Simpan riwayat obrolan?</span>
                    <button
                      type="button"
                      onClick={() => {
                        setIsJoined(false);
                        setActiveTab("register");
                      }}
                      style={{
                        backgroundColor: "#4f46e5",
                        color: "#ffffff",
                        border: "none",
                        borderRadius: "6px",
                        padding: "4px 8px",
                        fontSize: "10px",
                        fontWeight: "bold",
                        cursor: "pointer"
                      }}
                    >
                      Daftar Member →
                    </button>
                  </div>
                )}
                {messages.length === 0 ? (
                  <div style={{ textAlign: "center", color: "#94a3b8", fontSize: "12px", marginTop: "40px" }}>
                    Belum ada pesan. Silakan sapa Admin kami! 👋
                  </div>
                ) : (
                  messages.map((m) => {
                    const isAdmin = m.senderType === "AGENT";
                    const isMember = m.senderType === "MEMBER";

                    return (
                      <div
                        key={m.id}
                        style={{
                          alignSelf: isAdmin ? "flex-start" : "flex-end",
                          maxWidth: "85%",
                          display: "flex",
                          flexDirection: "column"
                        }}
                      >
                        {/* SENDER BADGE */}
                        <div
                          style={{
                            fontSize: "10px",
                            fontWeight: "bold",
                            marginBottom: "2px",
                            color: isAdmin ? "#d97706" : isMember ? "#059669" : "#64748b",
                            textAlign: isAdmin ? "left" : "right"
                          }}
                        >
                          {isAdmin ? "👑 Admin / CS" : isMember ? "👤 Member" : "Tamu"}
                        </div>

                        <div
                          style={{
                            padding: "9px 13px",
                            borderRadius: "14px",
                            borderBottomRightRadius: isAdmin ? "14px" : "2px",
                            borderBottomLeftRadius: isAdmin ? "2px" : "14px",
                            backgroundColor: isAdmin ? "#ffffff" : isMember ? "#059669" : "#4f46e5",
                            color: isAdmin ? "#0f172a" : "#ffffff",
                            boxShadow: "0 1px 2px 0 rgba(0,0,0,0.05)",
                            border: isAdmin ? "1px solid #e2e8f0" : "none",
                            fontSize: "13px",
                            lineHeight: "1.4"
                          }}
                        >
                          {m.attachmentUrl && (
                            <div style={{ marginBottom: "6px" }}>
                              <img
                                src={m.attachmentUrl}
                                alt="Lampiran"
                                onClick={() => setLightboxImg(m.attachmentUrl!)}
                                title="Klik untuk memperbesar"
                                style={{
                                  maxWidth: "100%",
                                  maxHeight: "180px",
                                  borderRadius: "8px",
                                  objectFit: "cover",
                                  display: "block",
                                  cursor: "pointer"
                                }}
                              />
                            </div>
                          )}
                          {m.content && <div>{m.content}</div>}
                          <div
                            style={{
                              fontSize: "9px",
                              marginTop: "3px",
                              textAlign: "right",
                              opacity: 0.75
                            }}
                          >
                            {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={chatEndRef} />
              </div>
            )}
          </div>

          {/* Footer Input */}
          {isJoined && (
            <div style={{ backgroundColor: "#ffffff", borderTop: "1px solid #e2e8f0", padding: "8px 12px" }}>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                style={{ display: "none" }}
              />
              <form
                onSubmit={handleSendMessage}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                  title="Upload Foto/Gambar (Maks 2MB)"
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "50%",
                    border: "1px solid #cbd5e1",
                    backgroundColor: "#f8fafc",
                    color: "#475569",
                    fontSize: "16px",
                    fontWeight: "bold",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    flexShrink: 0
                  }}
                >
                  +
                </button>
                <input
                  type="text"
                  placeholder={uploading ? "Sedang mengunggah (maks 2MB)..." : "Tulis pesan..."}
                  value={inputValue}
                  disabled={uploading}
                  onChange={(e) => setInputValue(e.target.value)}
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    borderRadius: "20px",
                    border: "1px solid #cbd5e1",
                    fontSize: "13px",
                    outline: "none"
                  }}
                />
                <button
                  type="submit"
                  disabled={(!inputValue.trim() && !uploading) || uploading}
                  style={{
                    padding: "8px 14px",
                    backgroundColor: "#4f46e5",
                    color: "#ffffff",
                    borderRadius: "20px",
                    border: "none",
                    fontWeight: "bold",
                    fontSize: "12px",
                    cursor: "pointer",
                    opacity: (!inputValue.trim() && !uploading) || uploading ? 0.5 : 1,
                    flexShrink: 0
                  }}
                >
                  Kirim
                </button>
              </form>
            </div>
          )}

          {/* PERMANENT FOOTER (IMAGE 2 DESIGN) */}
          <div style={{ padding: '8px 12px', textAlign: 'center', fontSize: '11px', color: '#94a3b8', backgroundColor: '#f8fafc', borderTop: '1px solid #f1f5f9', letterSpacing: '-0.01em' }}>
            Didukung oleh <strong style={{ color: '#4f46e5' }}>Lobbio Support.</strong>
          </div>
        </div>
      )}

      {/* FLOATING ACTION BUTTON (FAB) MATCHING IMAGE 1 */}
      <button
        onClick={handleToggle}
        aria-label="Buka Lobbio Support Chat"
        style={{
          position: "relative",
          width: "60px",
          height: "60px",
          borderRadius: "18px",
          background: "linear-gradient(135deg, #6677f2, #4c5de0)",
          color: "#ffffff",
          border: "none",
          boxShadow: "0 13px 30px rgba(61, 79, 198, 0.35)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "transform 0.2s ease, box-shadow 0.2s ease",
          pointerEvents: "auto"
        }}
      >
        <span
          style={{
            position: "absolute",
            top: "4px",
            right: "4px",
            width: "12px",
            height: "12px",
            backgroundColor: "#53d6a0",
            border: "2px solid #ffffff",
            borderRadius: "50%"
          }}
        />
        {isOpen ? (
          <span style={{ fontSize: "20px", fontWeight: "bold" }}>✕</span>
        ) : (
          <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
        )}
      </button>

      {/* Lightbox Pop-up Modal Gambar */}
      {lightboxImg && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.85)",
            zIndex: 99999999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
            cursor: "zoom-out"
          }}
          onClick={() => setLightboxImg(null)}
        >
          <div style={{ position: "relative", maxWidth: "90%", maxHeight: "90%" }}>
            <div
              style={{
                position: "absolute",
                top: "-36px",
                right: "0px",
                color: "#ffffff",
                fontSize: "13px",
                cursor: "pointer",
                backgroundColor: "rgba(255, 255, 255, 0.2)",
                padding: "3px 12px",
                borderRadius: "20px"
              }}
              onClick={() => setLightboxImg(null)}
            >
              ✕ Tutup
            </div>
            <img
              src={lightboxImg}
              alt="Pratinjau"
              style={{
                maxWidth: "100%",
                maxHeight: "85vh",
                borderRadius: "8px",
                objectFit: "contain",
                cursor: "default",
                boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)"
              }}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// Injeksi otomatis ke DOM halaman web
const container = document.createElement("div");
container.id = "livechat-widget-root";
document.body.appendChild(container);
const root = createRoot(container);
root.render(<LiveChatWidget />);
