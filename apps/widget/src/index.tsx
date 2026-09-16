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
  senderType: "VISITOR" | "MEMBER" | "AGENT";
  senderId: string;
  content: string;
  createdAt: string;
}

function LiveChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [session, setSession] = useState<any>(null);

  // Status Keanggotaan & Form
  const [isJoined, setIsJoined] = useState(false);
  const [activeTab, setActiveTab] = useState<"guest" | "login" | "register">("guest");
  const [currentMember, setCurrentMember] = useState<any>(null);

  // Form Fields
  const [guestName, setGuestName] = useState("");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isOpen]);

  // Cek token atau sesi tersimpan saat pertama kali dibuka
  useEffect(() => {
    const savedMember = localStorage.getItem("livechat_member_user");
    if (savedMember) {
      try {
        const member = JSON.parse(savedMember);
        setCurrentMember(member);
      } catch {}
    }

    const savedGuest = localStorage.getItem("livechat_guest_name");
    if (savedGuest) {
      setGuestName(savedGuest);
    }
  }, []);

  // WebSocket Connection Helper
  const connectWebSocket = (sessionId: string, senderType: "MEMBER" | "VISITOR", senderId: string) => {
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
    }
  };

  // 2. Gabung Sebagai Tamu (Anonim)
  const joinAsGuest = async (name: string) => {
    if (!WIDGET_TOKEN) return;

    let visitorId = localStorage.getItem("livechat_guest_vid");
    if (!visitorId) {
      visitorId = "gst_" + Math.random().toString(36).substring(2, 9);
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
    }
  };

  // Buka Widget
  const handleToggle = () => {
    const nextState = !isOpen;
    setIsOpen(nextState);

    // Jika member sudah login sebelumnya dan belum tersambung ke sesi
    if (nextState && !isJoined) {
      const savedMember = localStorage.getItem("livechat_member_user");
      if (savedMember) {
        try {
          const member = JSON.parse(savedMember);
          setCurrentMember(member);
          joinAsMember(member);
        } catch {}
      }
    }
  };

  // Handle Form Tamu
  const handleGuestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestName.trim()) return;
    localStorage.setItem("livechat_guest_name", guestName.trim());
    joinAsGuest(guestName.trim());
  };

  // Handle Form Member (Login / Register)
  const handleMemberAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError("");

    const endpoint = activeTab === "register" ? "/api/member/register" : "/api/member/login";

    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: authUsername.trim(),
          password: authPassword
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal memproses akun member");

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

  // Logout Member
  const handleLogout = () => {
    localStorage.removeItem("livechat_member_token");
    localStorage.removeItem("livechat_member_user");
    setCurrentMember(null);
    setIsJoined(false);
    setSession(null);
    setMessages([]);
    if (socketRef.current) socketRef.current.close();
  };

  // Kirim Pesan
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || !session || !socketRef.current) return;

    const senderType = currentMember ? "MEMBER" : "VISITOR";
    const senderId = currentMember
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

  return (
    <div style={{ position: "fixed", bottom: "24px", right: "24px", zIndex: 999999, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {/* CHAT WINDOW */}
      {isOpen && (
        <div
          style={{
            width: "360px",
            height: "530px",
            backgroundColor: "#ffffff",
            borderRadius: "16px",
            boxShadow: "0 10px 30px rgba(0,0,0,0.18), 0 4px 6px -2px rgba(0,0,0,0.05)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            marginBottom: "16px",
            border: "1px solid #e2e8f0"
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "14px 16px",
              backgroundColor: "#4f46e5",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between"
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <h4 style={{ margin: 0, fontSize: "15px", fontWeight: "bold" }}>LiveChat</h4>
                {currentMember && (
                  <span style={{ fontSize: "10px", backgroundColor: "#10b981", padding: "1px 6px", borderRadius: "10px", fontWeight: "bold" }}>
                    👤 {currentMember.username}
                  </span>
                )}
              </div>
              <p style={{ margin: "2px 0 0 0", fontSize: "11px", opacity: 0.85 }}>
                {currentMember ? "Riwayat Chat Tersimpan Permanen" : "Tanyakan apa saja kepada kami"}
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {currentMember && (
                <button
                  onClick={handleLogout}
                  title="Keluar dari akun member"
                  style={{
                    background: "rgba(255,255,255,0.2)",
                    border: "none",
                    color: "#ffffff",
                    fontSize: "11px",
                    padding: "3px 7px",
                    borderRadius: "6px",
                    cursor: "pointer"
                  }}
                >
                  Keluar
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
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
            {!isJoined ? (
              <div style={{ padding: "20px", display: "flex", flexDirection: "column", height: "100%", justifyContent: "center" }}>
                {/* Mode Selector Mini Tabs */}
                <div
                  style={{
                    display: "flex",
                    backgroundColor: "#e2e8f0",
                    borderRadius: "10px",
                    padding: "3px",
                    marginBottom: "16px"
                  }}
                >
                  <button
                    type="button"
                    onClick={() => { setActiveTab("guest"); setAuthError(""); }}
                    style={{
                      flex: 1,
                      padding: "6px",
                      fontSize: "12px",
                      fontWeight: activeTab === "guest" ? "bold" : "normal",
                      borderRadius: "8px",
                      border: "none",
                      backgroundColor: activeTab === "guest" ? "#ffffff" : "transparent",
                      color: activeTab === "guest" ? "#4f46e5" : "#64748b",
                      cursor: "pointer",
                      boxShadow: activeTab === "guest" ? "0 1px 2px rgba(0,0,0,0.05)" : "none"
                    }}
                  >
                    Tamu (Anon)
                  </button>
                  <button
                    type="button"
                    onClick={() => { setActiveTab("login"); setAuthError(""); }}
                    style={{
                      flex: 1,
                      padding: "6px",
                      fontSize: "12px",
                      fontWeight: activeTab === "login" ? "bold" : "normal",
                      borderRadius: "8px",
                      border: "none",
                      backgroundColor: activeTab === "login" ? "#ffffff" : "transparent",
                      color: activeTab === "login" ? "#4f46e5" : "#64748b",
                      cursor: "pointer",
                      boxShadow: activeTab === "login" ? "0 1px 2px rgba(0,0,0,0.05)" : "none"
                    }}
                  >
                    Masuk
                  </button>
                  <button
                    type="button"
                    onClick={() => { setActiveTab("register"); setAuthError(""); }}
                    style={{
                      flex: 1,
                      padding: "6px",
                      fontSize: "12px",
                      fontWeight: activeTab === "register" ? "bold" : "normal",
                      borderRadius: "8px",
                      border: "none",
                      backgroundColor: activeTab === "register" ? "#ffffff" : "transparent",
                      color: activeTab === "register" ? "#4f46e5" : "#64748b",
                      cursor: "pointer",
                      boxShadow: activeTab === "register" ? "0 1px 2px rgba(0,0,0,0.05)" : "none"
                    }}
                  >
                    Daftar
                  </button>
                </div>

                {authError && (
                  <div style={{ backgroundColor: "#fee2e2", color: "#b91c1c", padding: "8px 12px", borderRadius: "8px", fontSize: "12px", marginBottom: "12px" }}>
                    {authError}
                  </div>
                )}

                {/* TAB 1: TAMU */}
                {activeTab === "guest" && (
                  <form onSubmit={handleGuestSubmit} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div style={{ textAlign: "center", marginBottom: "4px" }}>
                      <p style={{ margin: 0, fontWeight: "bold", fontSize: "14px", color: "#1e293b" }}>Mode Tamu Cepat</p>
                      <p style={{ margin: "2px 0 0 0", fontSize: "12px", color: "#64748b" }}>Mulai mengobrol tanpa perlu kata sandi.</p>
                    </div>
                    <input
                      type="text"
                      required
                      placeholder="Ketik Nama Anda..."
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      style={{
                        padding: "10px 12px",
                        borderRadius: "8px",
                        border: "1px solid #cbd5e1",
                        fontSize: "13px",
                        outline: "none"
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
                        fontSize: "13px"
                      }}
                    >
                      Masuk Sebagai Tamu →
                    </button>
                  </form>
                )}

                {/* TAB 2 & 3: MEMBER AUTH */}
                {(activeTab === "login" || activeTab === "register") && (
                  <form onSubmit={handleMemberAuth} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div style={{ textAlign: "center", marginBottom: "4px" }}>
                      <p style={{ margin: 0, fontWeight: "bold", fontSize: "14px", color: "#1e293b" }}>
                        {activeTab === "login" ? "Masuk Akun Member" : "Daftar Akun Member Baru"}
                      </p>
                      <p style={{ margin: "2px 0 0 0", fontSize: "12px", color: "#64748b" }}>
                        Riwayat percakapan Anda akan tersimpan permanen.
                      </p>
                    </div>
                    <input
                      type="text"
                      required
                      placeholder="Username..."
                      value={authUsername}
                      onChange={(e) => setAuthUsername(e.target.value)}
                      style={{
                        padding: "9px 12px",
                        borderRadius: "8px",
                        border: "1px solid #cbd5e1",
                        fontSize: "13px",
                        outline: "none"
                      }}
                    />
                    <input
                      type="password"
                      required
                      placeholder="Kata Sandi..."
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      style={{
                        padding: "9px 12px",
                        borderRadius: "8px",
                        border: "1px solid #cbd5e1",
                        fontSize: "13px",
                        outline: "none"
                      }}
                    />
                    <button
                      type="submit"
                      disabled={authLoading}
                      style={{
                        padding: "10px",
                        borderRadius: "8px",
                        border: "none",
                        backgroundColor: activeTab === "login" ? "#4f46e5" : "#10b981",
                        color: "#ffffff",
                        fontWeight: "bold",
                        cursor: "pointer",
                        fontSize: "13px",
                        opacity: authLoading ? 0.7 : 1
                      }}
                    >
                      {authLoading ? "Memproses..." : activeTab === "login" ? "Masuk Member →" : "Buat Akun Member Sekarang ✨"}
                    </button>
                  </form>
                )}
              </div>
            ) : (
              /* CHAT MESSAGES */
              <div style={{ padding: "14px", display: "flex", flexDirection: "column", gap: "10px" }}>
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
                          <div>{m.content}</div>
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
            <form
              onSubmit={handleSendMessage}
              style={{
                padding: "10px 12px",
                backgroundColor: "#ffffff",
                borderTop: "1px solid #e2e8f0",
                display: "flex",
                gap: "8px"
              }}
            >
              <input
                type="text"
                placeholder="Tulis pesan..."
                value={inputValue}
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
                disabled={!inputValue.trim()}
                style={{
                  padding: "8px 14px",
                  backgroundColor: "#4f46e5",
                  color: "#ffffff",
                  borderRadius: "20px",
                  border: "none",
                  fontWeight: "bold",
                  fontSize: "12px",
                  cursor: "pointer",
                  opacity: inputValue.trim() ? 1 : 0.5
                }}
              >
                Kirim
              </button>
            </form>
          )}
        </div>
      )}

      {/* FLOATING ACTION BUTTON (FAB) */}
      <button
        onClick={handleToggle}
        style={{
          width: "56px",
          height: "56px",
          borderRadius: "50%",
          backgroundColor: "#4f46e5",
          color: "#ffffff",
          border: "none",
          boxShadow: "0 8px 20px rgba(79, 70, 229, 0.4)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          float: "right",
          transition: "transform 0.2s"
        }}
      >
        {isOpen ? (
          <span style={{ fontSize: "22px" }}>✕</span>
        ) : (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
        )}
      </button>
    </div>
  );
}

// Injeksi otomatis ke DOM halaman web
const container = document.createElement("div");
container.id = "livechat-widget-root";
document.body.appendChild(container);
const root = createRoot(container);
root.render(<LiveChatWidget />);
