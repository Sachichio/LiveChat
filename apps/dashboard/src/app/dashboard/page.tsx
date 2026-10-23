"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  MessageSquare,
  Send,
  LogOut,
  Code,
  Copy,
  Check,
  User,
  Radio,
  Plus,
  Inbox,
  ExternalLink,
  Laptop,
  Shield
} from "lucide-react";

interface Project {
  id: string;
  name: string;
  domain: string;
  widgetToken: string;
}

interface ChatSession {
  id: string;
  visitorId: string;
  visitorName: string | null;
  memberId?: string | null;
  status: string;
  updatedAt: string;
  messages: any[];
}

interface Message {
  id: string;
  senderType: "VISITOR" | "AGENT" | "MEMBER";
  senderId: string;
  content: string;
  attachmentUrl?: string | null;
  createdAt: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: "error" | "success" } | null>(null);

  const showToast = (message: string, type: "error" | "success" = "error") => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((curr) => (curr?.message === message ? null : curr));
    }, 4500);
  };
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll chat
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Auth check dengan Role Guard
  useEffect(() => {
    const token = localStorage.getItem("lobbio_support_token") || localStorage.getItem("livechat_token");
    const storedUser = localStorage.getItem("livechat_user");
    if (!token || !storedUser) {
      router.push("/login");
      return;
    }
    try {
      const parsed = JSON.parse(storedUser);
      if (parsed.role !== "ADMIN" && parsed.role !== "AGENT") {
        showToast("Akses Ditolak: Halaman Dashboard hanya dapat diakses oleh Admin.", "error");
        localStorage.removeItem("livechat_token");
        localStorage.removeItem("livechat_user");
        router.push("/login");
        return;
      }
      setUser(parsed);
      fetchProjects(token);
      setIsAuthChecking(false);
    } catch {
      router.push("/login");
    }
  }, []);

  // Fetch projects
  const fetchProjects = async (token: string) => {
    try {
      const res = await fetch("http://localhost:4000/api/projects", {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.projects) {
        setProjects(data.projects);
        if (data.projects.length > 0) {
          setSelectedProject(data.projects[0]);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Fetch sessions when project changes
  useEffect(() => {
    if (!selectedProject) return;
    const token = localStorage.getItem("lobbio_support_token") || localStorage.getItem("livechat_token");
    if (!token) return;

    const fetchSessions = async () => {
      try {
        const res = await fetch(
          `http://localhost:4000/api/sessions/by-project/${selectedProject.id}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await res.json();
        if (data.sessions) {
          setSessions(data.sessions);
          if (data.sessions.length > 0) {
            handleSelectSession(data.sessions[0]);
          } else {
            setSelectedSession(null);
            setMessages([]);
          }
        }
      } catch (err) {
        console.error(err);
      }
    };

    fetchSessions();
  }, [selectedProject]);

  // Select a session and connect to WebSocket
  const handleSelectSession = async (session: ChatSession) => {
    setSelectedSession(session);

    // Fetch message history
    try {
      const res = await fetch(
        `http://localhost:4000/api/sessions/${session.id}/messages`
      );
      const data = await res.json();
      if (data.messages) {
        setMessages(data.messages);
      }
    } catch (err) {
      console.error(err);
    }

    // Connect WebSocket
    if (socketRef.current) {
      socketRef.current.close();
    }

    const ws = new WebSocket("ws://localhost:4000/ws");
    socketRef.current = ws;

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: "join",
          sessionId: session.id,
          senderType: "AGENT",
          senderId: user?.id || "agent"
        })
      );
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "new_message" && data.message) {
          setMessages((prev) => {
            // Cek jika pesan sudah ada
            if (prev.some((m) => m.id === data.message.id)) return prev;
            return [...prev, data.message];
          });
        }
      } catch (e) {
        console.error("WS Parse error", e);
      }
    };
  };

  // Send message
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || !selectedSession || !socketRef.current) return;

    socketRef.current.send(
      JSON.stringify({
        type: "message",
        sessionId: selectedSession.id,
        senderType: "AGENT",
        senderId: user?.id || "agent",
        content: inputMessage.trim()
      })
    );

    setInputMessage("");
  };

  // Upload file attachment (max 2MB, image only)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedSession || !socketRef.current) return;

    const allowedMimes = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"];
    if (!file.type || !allowedMimes.includes(file.type.toLowerCase())) {
      showToast("Format file tidak didukung! Hanya gambar (PNG, JPG, JPEG, WEBP, GIF) yang diperbolehkan.", "error");
      e.target.value = "";
      return;
    }

    const MAX_SIZE = 2 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      showToast("Ukuran file terlalu besar! Maksimal ukuran gambar adalah 2 MB.", "error");
      e.target.value = "";
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

      socketRef.current.send(
        JSON.stringify({
          type: "message",
          sessionId: selectedSession.id,
          senderType: "AGENT",
          senderId: user?.id || "agent",
          content: inputMessage.trim() || "",
          attachmentUrl: data.url
        })
      );
      setInputMessage("");
    } catch (err: any) {
      showToast(err.message || "Gagal mengunggah gambar", "error");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  // Create project
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem("lobbio_support_token") || localStorage.getItem("livechat_token");
    if (!token || !newProjectName) return;

    try {
      const res = await fetch("http://localhost:4000/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ name: newProjectName })
      });
      const data = await res.json();
      if (data.project) {
        setProjects([data.project, ...projects]);
        setSelectedProject(data.project);
        setNewProjectName("");
        setShowModal(false);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCopyEmbed = () => {
    if (!selectedProject) return;
    const embedSnippet = `<script src="http://localhost:4000/widget.js" data-token="${selectedProject.widgetToken}" defer></script>`;
    navigator.clipboard.writeText(embedSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLogout = () => {
    localStorage.removeItem("livechat_token");
    localStorage.removeItem("livechat_user");
    router.push("/login");
  };

  if (isAuthChecking) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 text-slate-500">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-1"></div>
          <span className="text-sm font-medium">Memverifikasi Sesi...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden font-sans relative">
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
      {/* SIDEBAR: Projects & User Info */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col justify-between border-r border-slate-800">
        <div>
          {/* Brand */}
          <div className="p-5 flex items-center gap-3 border-b border-slate-800">
            <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-md">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-white text-base leading-tight">
                Lobbio Support
              </h2>
              <span className="text-xs text-indigo-400">Admin Workspace</span>
            </div>
          </div>

          {/* Project List */}
          <div className="p-4">
            <div className="flex items-center justify-between mb-3 text-xs uppercase tracking-wider text-slate-400 font-semibold">
              <span>Proyek Website</span>
              <button
                onClick={() => setShowModal(true)}
                className="hover:text-white p-1 rounded hover:bg-slate-800 transition"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1">
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedProject(p)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition flex items-center justify-between ${
                    selectedProject?.id === p.id
                      ? "bg-indigo-600 text-white font-medium"
                      : "hover:bg-slate-800 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <span className="truncate">{p.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* User Info & Logout */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/40 flex items-center justify-between">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-300 text-xs">
              <User className="w-4 h-4" />
            </div>
            <div className="truncate">
              <p className="text-sm font-medium text-white truncate">
                {user?.name || "Admin"}
              </p>
              <p className="text-xs text-slate-500 truncate">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            title="Keluar"
            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* MIDDLE: Chat Session Inbox */}
      <section className="w-80 bg-white border-r border-slate-200 flex flex-col">
        {/* Inbox Header */}
        <div className="p-4 border-b border-slate-200">
          <h3 className="font-semibold text-slate-800 text-base">
            Kotak Masuk Chat
          </h3>
          <p className="text-xs text-slate-500 mt-0.5 truncate">
            {selectedProject ? selectedProject.name : "Pilih proyek"}
          </p>
        </div>

        {/* Sessions List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {sessions.length === 0 ? (
            <div className="p-8 text-center text-slate-400 flex flex-col items-center justify-center h-full">
              <Inbox className="w-10 h-10 mb-2 stroke-1" />
              <p className="text-sm">Belum ada obrolan masuk</p>
              <p className="text-xs text-slate-400 mt-1">
                Pasang widget atau buka Room Publik untuk mulai menerima chat.
              </p>
              {selectedProject && (
                <a
                  href={`/room/${selectedProject.widgetToken}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 text-xs bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-medium px-3 py-1.5 rounded-lg border border-indigo-200 transition"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Uji Coba Chat Sekarang
                </a>
              )}
            </div>
          ) : (
            sessions.map((s) => (
              <button
                key={s.id}
                onClick={() => handleSelectSession(s)}
                className={`w-full text-left p-4 transition flex flex-col gap-1 ${
                  selectedSession?.id === s.id
                    ? "bg-indigo-50/70 border-l-4 border-indigo-600"
                    : "hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 truncate max-w-[190px]">
                    <span className="font-medium text-slate-800 text-sm truncate">
                      {s.visitorName || "Pengunjung"}
                    </span>
                    {s.memberId ? (
                      <span className="text-[10px] bg-emerald-100 text-emerald-700 font-semibold px-1.5 py-0.5 rounded flex items-center gap-0.5 shrink-0">
                        <Shield className="w-2.5 h-2.5 text-emerald-600" /> Member
                      </span>
                    ) : (
                      <span className="text-[10px] bg-slate-100 text-slate-600 font-medium px-1.5 py-0.5 rounded shrink-0">
                        Tamu
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-emerald-600 font-semibold px-1.5 py-0.5 bg-emerald-50 rounded-full flex items-center gap-1 shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    {s.status}
                  </span>
                </div>
                <p className="text-xs text-slate-500 truncate">
                  {(() => {
                    const lastMsg = s.messages && s.messages.length > 0 ? s.messages[s.messages.length - 1] : null;
                    if (!lastMsg) return "Obrolan baru dibuka";
                    if (lastMsg.content && lastMsg.content.trim()) return lastMsg.content;
                    if (lastMsg.attachmentUrl) {
                      if (lastMsg.senderType === "AGENT") return "📷 Anda mengirim gambar";
                      const senderName = s.visitorName || (s.memberId ? "Member" : "Tamu");
                      return `📷 ${senderName} mengirim gambar`;
                    }
                    return "Obrolan baru dibuka";
                  })()}
                </p>
              </button>
            ))
          )}
        </div>

        {/* Embed Script Helper Box */}
        {selectedProject && (
          <div className="p-3 bg-slate-50 border-t border-slate-200">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                <Code className="w-3.5 h-3.5 text-indigo-600" /> Kode Pasang (Embed)
              </span>
              <button
                onClick={handleCopyEmbed}
                className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1 font-medium"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" /> Tersalin!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" /> Salin Tag
                  </>
                )}
              </button>
            </div>
            <code className="block bg-slate-200 text-slate-700 p-2 rounded text-[10px] font-mono break-all leading-tight">
              &lt;script src=&quot;http://localhost:4000/widget.js&quot;
              data-token=&quot;{selectedProject.widgetToken}&quot;
              defer&gt;&lt;/script&gt;
            </code>
            <div className="mt-2.5 flex flex-col gap-1.5">
              <a
                href={`/simulator-widget/${selectedProject.widgetToken}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full bg-slate-800 hover:bg-slate-900 text-white font-medium py-2 px-2.5 rounded-lg text-xs flex items-center justify-center gap-1.5 transition shadow-sm"
              >
                <Laptop className="w-3.5 h-3.5 text-amber-400" /> 📱 Test Widget (Kanan Bawah)
              </a>
              <a
                href={`/room/${selectedProject.widgetToken}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-2.5 rounded-lg text-xs flex items-center justify-center gap-1.5 transition shadow-sm"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Buka Room Publik (Chatango Style)
              </a>
            </div>
          </div>
        )}
      </section>

      {/* RIGHT: Active Chat Conversation */}
      <main className="flex-1 bg-slate-50 flex flex-col">
        {selectedSession ? (
          <>
            {/* Chat Header */}
            <div className="p-4 bg-white border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold">
                  {selectedSession.visitorName?.charAt(0).toUpperCase() || "V"}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-slate-800 text-sm">
                      {selectedSession.visitorName || "Pengunjung Website"}
                    </h4>
                    {selectedSession.memberId ? (
                      <span className="text-[11px] bg-emerald-100 text-emerald-700 font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Shield className="w-3 h-3 text-emerald-600" /> Member Terdaftar
                      </span>
                    ) : (
                      <span className="text-[11px] bg-slate-200 text-slate-600 font-medium px-2 py-0.5 rounded-full">
                        Tamu Anonim
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                    <Radio className="w-3 h-3 text-emerald-500 animate-pulse" />
                    Koneksi Realtime Aktif
                  </p>
                </div>
              </div>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3">
              {messages.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                  Belum ada pesan di percakapan ini.
                </div>
              ) : (
                messages.map((m) => {
                  const isAgent = m.senderType === "AGENT";
                  return (
                    <div
                      key={m.id}
                      className={`flex ${
                        isAgent ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div
                        className={`max-w-md px-4 py-2.5 rounded-2xl text-sm shadow-sm ${
                          isAgent
                            ? "bg-indigo-600 text-white rounded-br-none"
                            : "bg-white text-slate-800 border border-slate-200 rounded-bl-none"
                        }`}
                      >
                        {m.attachmentUrl && (
                          <div className="mb-2">
                            <img
                              src={m.attachmentUrl}
                              alt="Lampiran"
                              onClick={() => setLightboxImg(m.attachmentUrl!)}
                              className="rounded-lg max-h-64 max-w-full object-cover border border-black/10 hover:opacity-90 transition cursor-pointer shadow-sm"
                              title="Klik untuk memperbesar"
                            />
                          </div>
                        )}
                        {m.content && <p>{m.content}</p>}
                        <span
                          className={`block text-[10px] mt-1 text-right ${
                            isAgent ? "text-indigo-200" : "text-slate-400"
                          }`}
                        >
                          {new Date(m.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit"
                          })}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
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
                  className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 hover:text-indigo-600 transition flex items-center justify-center shrink-0 disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                </button>
                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder={uploading ? "Sedang mengunggah gambar (maks 2MB)..." : "Ketik balasan untuk pengunjung..."}
                  disabled={uploading}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-slate-800 disabled:bg-slate-50"
                />
                <button
                  type="submit"
                  disabled={(!inputMessage.trim() && !uploading) || uploading}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl flex items-center gap-2 font-medium text-sm transition shrink-0"
                >
                  <Send className="w-4 h-4" /> Kirim
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8 text-center">
            <MessageSquare className="w-12 h-12 mb-3 stroke-1 text-slate-300" />
            <h4 className="text-base font-semibold text-slate-600">
              Pilih Percakapan
            </h4>
            <p className="text-sm text-slate-400 max-w-sm mt-1">
              Pilih salah satu obrolan dari kotak masuk sebelah kiri untuk mulai
              berkomunikasi dengan pengunjung.
            </p>
          </div>
        )}
      </main>

      {/* Modal Buat Project Baru */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-lg font-bold text-slate-800 mb-3">
              Tambah Proyek Baru
            </h3>
            <form onSubmit={handleCreateProject} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Nama Website / Proyek
                </label>
                <input
                  type="text"
                  required
                  placeholder="cth: Toko Online Saya"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium"
                >
                  Simpan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
