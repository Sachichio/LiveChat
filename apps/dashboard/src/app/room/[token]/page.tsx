"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import {
  MessageSquare,
  Send,
  User,
  Crown,
  Radio,
  Share2,
  Check,
  Sparkles,
  ArrowRight,
  Shield,
  LogOut,
  KeyRound,
  UserPlus
} from "lucide-react";

interface Message {
  id: string;
  senderType: "VISITOR" | "AGENT" | "MEMBER";
  senderId: string;
  content: string;
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

  // Authentication & Identity State
  const [currentMember, setCurrentMember] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"guest" | "login" | "register">("guest");
  const [guestName, setGuestName] = useState("");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load project info & existing member or guest session
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

        // Cek apakah ada member yang sedang login di browser ini
        const savedMember = localStorage.getItem("livechat_member_user");
        if (savedMember) {
          try {
            const memberObj = JSON.parse(savedMember);
            setCurrentMember(memberObj);
            joinRoomAsMember(memberObj, data.project);
            return;
          } catch {}
        }

        // Cek apakah ada nama tamu tersimpan
        const savedGuest = localStorage.getItem("livechat_guest_name");
        if (savedGuest) {
          setGuestName(savedGuest);
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchProject();
  }, [token]);

  // --- JOIN HANDLERS ---

  // 1. Join Sebagai Member (Dengan Chat History Permanen)
  const joinRoomAsMember = async (member: any, proj = project) => {
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
    } catch (err) {
      console.error("Join as member error", err);
    }
  };

  // 2. Join Sebagai Tamu (Anonim)
  const joinRoomAsGuest = async (name: string) => {
    if (!token) return;

    let visitorId = localStorage.getItem("livechat_guest_vid");
    if (!visitorId) {
      visitorId = "gst_" + Math.random().toString(36).substring(2, 9);
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
    } catch (err) {
      console.error("Join as guest error", err);
    }
  };

  // Connect WebSocket Helper
  const connectWebSocket = (sessionId: string, senderType: "MEMBER" | "VISITOR", senderId: string) => {
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

  // --- FORM SUBMIT ACTIONS ---

  const handleGuestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestName.trim()) return;
    localStorage.setItem("livechat_guest_name", guestName.trim());
    joinRoomAsGuest(guestName.trim());
  };

  const handleMemberAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError("");

    const endpoint = activeTab === "register" ? "/api/member/register" : "/api/member/login";

    try {
      const res = await fetch(`http://localhost:4000${endpoint}`, {
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
      joinRoomAsMember(data.member);
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleMemberLogout = () => {
    localStorage.removeItem("livechat_member_token");
    localStorage.removeItem("livechat_member_user");
    setCurrentMember(null);
    setIsJoined(false);
    setSession(null);
    setMessages([]);
    if (socketRef.current) socketRef.current.close();
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || !session || !socketRef.current) return;

    const senderType = currentMember ? "MEMBER" : "VISITOR";
    const senderId = currentMember
      ? currentMember.id
      : localStorage.getItem("livechat_guest_vid") || "guest";

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

  const handleCopyLink = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm font-medium">Menghubungkan ke Ruang Chat...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl max-w-md text-center text-white shadow-xl">
          <div className="w-12 h-12 bg-rose-500/20 text-rose-400 rounded-xl flex items-center justify-center mx-auto mb-4 font-bold">
            ✕
          </div>
          <h2 className="text-xl font-bold mb-2">Room Tidak Ditemukan</h2>
          <p className="text-slate-400 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-0 md:p-6 font-sans">
      <div className="w-full max-w-4xl h-screen md:h-[85vh] bg-slate-900 md:rounded-2xl border border-slate-800 flex flex-col overflow-hidden shadow-2xl">
        
        {/* ROOM TOP BAR */}
        <header className="px-6 py-4 bg-slate-900/90 backdrop-blur border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-tr from-indigo-600 to-sky-500 rounded-xl flex items-center justify-center text-white shadow-md shadow-indigo-500/25">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-white">
                  {project?.name || "Live Chat Room"}
                </h1>
                <span className="text-[11px] bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-medium px-2 py-0.5 rounded-full flex items-center gap-1.5">
                  <Radio className="w-3 h-3 animate-pulse text-emerald-400" />
                  Live
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Ruang Obrolan Publik Pengunjung &amp; Admin
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {currentMember && isJoined && (
              <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700">
                <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                  <Shield className="w-3.5 h-3.5" /> @{currentMember.username}
                </span>
                <button
                  onClick={handleMemberLogout}
                  title="Keluar Akun Member"
                  className="text-slate-400 hover:text-rose-400 p-0.5 rounded transition ml-1"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <button
              onClick={handleCopyLink}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition flex items-center gap-1.5 border border-slate-700"
              title="Salin link room ini"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" /> Tersalin!
                </>
              ) : (
                <>
                  <Share2 className="w-3.5 h-3.5" /> Bagikan Link
                </>
              )}
            </button>
          </div>
        </header>

        {/* JOIN SCREEN: 3 TABS (TAMU / LOGIN / DAFTAR) */}
        {!isJoined ? (
          <div className="flex-1 flex items-center justify-center p-6 bg-slate-950/50">
            <div className="w-full max-w-md bg-slate-900 border border-slate-800 p-6 md:p-8 rounded-2xl shadow-xl">
              
              <div className="text-center mb-6">
                <div className="w-12 h-12 bg-gradient-to-tr from-indigo-600 to-sky-500 rounded-2xl flex items-center justify-center text-white mx-auto mb-3 shadow-lg shadow-indigo-500/25">
                  <Sparkles className="w-6 h-6" />
                </div>
                <h2 className="text-lg font-bold text-white">
                  Gabung ke {project?.name}
                </h2>
                <p className="text-slate-400 text-xs mt-1">
                  Pilih cara masuk Anda untuk mulai berinteraksi.
                </p>
              </div>

              {/* TAB SELECTOR */}
              <div className="flex p-1 bg-slate-800/80 rounded-xl mb-6 text-xs font-semibold">
                <button
                  onClick={() => {
                    setActiveTab("guest");
                    setAuthError("");
                  }}
                  className={`flex-1 py-2 rounded-lg transition flex items-center justify-center gap-1.5 ${
                    activeTab === "guest"
                      ? "bg-indigo-600 text-white shadow"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <User className="w-3.5 h-3.5" /> Tamu (Anon)
                </button>
                <button
                  onClick={() => {
                    setActiveTab("login");
                    setAuthError("");
                  }}
                  className={`flex-1 py-2 rounded-lg transition flex items-center justify-center gap-1.5 ${
                    activeTab === "login"
                      ? "bg-indigo-600 text-white shadow"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <KeyRound className="w-3.5 h-3.5" /> Masuk Member
                </button>
                <button
                  onClick={() => {
                    setActiveTab("register");
                    setAuthError("");
                  }}
                  className={`flex-1 py-2 rounded-lg transition flex items-center justify-center gap-1.5 ${
                    activeTab === "register"
                      ? "bg-indigo-600 text-white shadow"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <UserPlus className="w-3.5 h-3.5" /> Daftar Akun
                </button>
              </div>

              {authError && (
                <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-xl text-xs text-center">
                  {authError}
                </div>
              )}

              {/* TAB 1: GUEST FORM */}
              {activeTab === "guest" && (
                <form onSubmit={handleGuestSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Nama Samaran
                    </label>
                    <input
                      type="text"
                      required
                      autoFocus
                      placeholder="cth: PengunjungAnon"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    />
                    <p className="text-[11px] text-slate-500 mt-1.5">
                      💡 Masuk cepat tanpa password. Riwayat tersimpan di browser ini.
                    </p>
                  </div>
                  <button
                    type="submit"
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2.5 rounded-xl transition flex items-center justify-center gap-2 text-sm shadow-md shadow-indigo-600/30"
                  >
                    Masuk Sebagai Tamu <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              )}

              {/* TAB 2 & 3: MEMBER AUTH FORM */}
              {(activeTab === "login" || activeTab === "register") && (
                <form onSubmit={handleMemberAuth} className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Username Member
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="username_anda"
                      value={authUsername}
                      onChange={(e) => setAuthUsername(e.target.value)}
                      className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Password
                    </label>
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    />
                  </div>

                  <p className="text-[11px] text-emerald-400/90 pt-1">
                    ✨ Keuntungan Member: Riwayat percakapan tersimpan permanen di database, dapat dibuka dari HP/laptop manapun!
                  </p>

                  <button
                    type="submit"
                    disabled={authLoading}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2.5 rounded-xl transition flex items-center justify-center gap-2 text-sm shadow-md shadow-indigo-600/30 disabled:opacity-50 mt-2"
                  >
                    {authLoading
                      ? "Memproses..."
                      : activeTab === "register"
                      ? "Daftar Akun & Gabung"
                      : "Masuk Akun Member"}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* MESSAGES FEED */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 bg-slate-950/20">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 text-sm">
                  <MessageSquare className="w-10 h-10 mb-2 stroke-1 text-slate-600" />
                  <p>Belum ada riwayat pesan di ruang chat ini.</p>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Kirim pesan pertama untuk memulai obrolan dengan Admin!
                  </p>
                </div>
              ) : (
                messages.map((m) => {
                  const isAgent = m.senderType === "AGENT";
                  const isMember = m.senderType === "MEMBER";
                  const isMe =
                    (currentMember && m.senderId === currentMember.id) ||
                    (!currentMember &&
                      !isAgent &&
                      typeof window !== "undefined" &&
                      m.senderId === localStorage.getItem("livechat_guest_vid"));

                  return (
                    <div
                      key={m.id}
                      className={`flex gap-3 ${
                        isMe
                          ? "justify-end"
                          : "justify-start"
                      }`}
                    >
                      {!isMe && (
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 ${
                            isAgent
                              ? "bg-gradient-to-tr from-amber-500 to-indigo-600 text-white shadow-md shadow-indigo-500/20"
                              : isMember
                              ? "bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-md"
                              : "bg-slate-800 text-slate-300 border border-slate-700"
                          }`}
                        >
                          {isAgent ? <Crown className="w-4 h-4" /> : isMember ? <Shield className="w-4 h-4" /> : <User className="w-4 h-4" />}
                        </div>
                      )}

                      <div className={`max-w-md ${isMe ? "items-end" : "items-start"}`}>
                        <div className="flex items-center gap-2 mb-1 px-1">
                          {isAgent ? (
                            <span className="text-xs font-bold text-amber-400 flex items-center gap-1">
                              <Crown className="w-3 h-3 text-amber-400" /> Admin / Operator
                            </span>
                          ) : isMember ? (
                            <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                              <Shield className="w-3 h-3 text-emerald-400" /> Member
                            </span>
                          ) : (
                            <span className="text-xs font-medium text-slate-400">
                              {isMe ? "Anda (Tamu)" : "Pengunjung (Tamu)"}
                            </span>
                          )}
                          <span className="text-[10px] text-slate-500">
                            {new Date(m.createdAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit"
                            })}
                          </span>
                        </div>

                        <div
                          className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm ${
                            isAgent
                              ? "bg-gradient-to-r from-indigo-950 to-slate-900 border border-indigo-500/30 text-indigo-100 rounded-tl-none"
                              : isMe
                              ? "bg-indigo-600 text-white rounded-tr-none"
                              : "bg-slate-800 text-slate-100 border border-slate-700 rounded-tl-none"
                          }`}
                        >
                          {m.content}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* INPUT BAR */}
            <div className="p-4 bg-slate-900 border-t border-slate-800">
              <form onSubmit={handleSendMessage} className="flex gap-2">
                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder={`Tulis pesan sebagai ${
                    currentMember ? `@${currentMember.username}` : guestName || "Tamu"
                  }...`}
                  className="flex-1 px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                />
                <button
                  type="submit"
                  disabled={!inputMessage.trim()}
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-6 py-3 rounded-xl flex items-center gap-2 font-medium text-sm transition shadow-md shadow-indigo-600/30"
                >
                  <Send className="w-4 h-4" />
                  <span className="hidden sm:inline">Kirim</span>
                </button>
              </form>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
