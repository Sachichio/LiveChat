import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { jwt } from "@elysiajs/jwt";
import { db } from "@livechat/database";
import path from "path";

const app = new Elysia()
  .use(
    cors({
      origin: "*",
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"]
    })
  )
  .use(
    jwt({
      name: "jwt",
      secret: process.env.JWT_SECRET || "livechat-jwt-secret-key"
    })
  )
  .get("/", () => ({ status: "ok", message: "LiveChat API & WebSocket is running 🚀" }))
  .get("/widget.js", ({ set }) => {
    set.headers["content-type"] = "application/javascript";
    const widgetPath = path.resolve(import.meta.dir, "../../widget/dist/widget.js");
    return Bun.file(widgetPath);
  })

  // --- SERVE UPLOADED FILES ---
  .get("/uploads/*", ({ params, set }) => {
    const filename = params["*"];
    const filePath = path.resolve(import.meta.dir, "../public/uploads", filename);
    const file = Bun.file(filePath);
    return file;
  })

  // --- UPLOAD GAMBAR ENDPOINT (MAX 5MB, IMAGE ONLY) ---
  .post("/api/upload", async ({ body, set }: any) => {
    try {
      const file = body?.file || body?.image;
      if (!file) {
        set.status = 400;
        return { error: "File gambar tidak ditemukan!" };
      }

      // Validasi MIME type
      if (!file.type || !file.type.startsWith("image/")) {
        set.status = 400;
        return { error: "Hanya file gambar (PNG, JPG, JPEG, GIF, WEBP) yang diizinkan!" };
      }

      // Validasi ukuran (maksimal 5 MB = 5 * 1024 * 1024 bytes)
      const MAX_SIZE = 5 * 1024 * 1024;
      if (file.size > MAX_SIZE) {
        set.status = 400;
        return { error: "Ukuran file terlalu besar! Maksimal 5 MB." };
      }

      const uploadDir = path.resolve(import.meta.dir, "../public/uploads");
      const ext = path.extname(file.name) || ".png";
      const uniqueName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
      const destPath = path.join(uploadDir, uniqueName);

      await Bun.write(destPath, file);

      return {
        url: `http://localhost:4000/uploads/${uniqueName}`,
        fileName: file.name,
        size: file.size
      };
    } catch (err: any) {
      set.status = 500;
      return { error: "Gagal mengunggah gambar: " + (err.message || err) };
    }
  })

  // --- ADMIN & AGENT AUTH ENDPOINTS ---
  .group("/api/auth", (group) =>
    group
      .post(
        "/register",
        async ({ body, headers, set }) => {
          // LOCKDOWN KEAMANAN ADMIN: Registrasi publik dinonaktifkan
          const secret = headers["x-admin-secret"];
          const validSecret = process.env.ADMIN_REGISTER_SECRET || "SUPER_ADMIN_LIVECHAT_2026";
          if (!secret || secret !== validSecret) {
            set.status = 403;
            return { error: "Registrasi Admin publik telah dinonaktifkan demi keamanan sistem." };
          }

          const { email, password, name } = body;
          const existing = await db.user.findUnique({ where: { email } });
          if (existing) {
            set.status = 400;
            return { error: "Email sudah terdaftar" };
          }
          const hashedPassword = await Bun.password.hash(password);
          const user = await db.user.create({
            data: {
              email,
              password: hashedPassword,
              name,
              role: "ADMIN"
            }
          });

          // Default project untuk admin baru
          const defaultProject = await db.project.create({
            data: {
              name: "Website Saya",
              domain: "*",
              ownerId: user.id
            }
          });

          return {
            message: "Registrasi admin berhasil",
            user: { id: user.id, email: user.email, name: user.name, role: user.role },
            defaultProject
          };
        },
        {
          body: t.Object({
            email: t.String(),
            password: t.String(),
            name: t.String()
          })
        }
      )
      .post(
        "/login",
        async ({ body, jwt, set }) => {
          const { email, password } = body;
          const user = await db.user.findUnique({ where: { email } });
          if (!user) {
            set.status = 401;
            return { error: "Email atau password salah" };
          }

          // ROLE GUARD: Hanya ADMIN dan AGENT yang boleh login di portal admin
          if (user.role !== "ADMIN" && user.role !== "AGENT") {
            set.status = 403;
            return { error: "Akses ditolak: Akun ini bukan akun Admin/Agent" };
          }

          const isMatch = await Bun.password.verify(password, user.password);
          if (!isMatch) {
            set.status = 401;
            return { error: "Email atau password salah" };
          }

          const token = await jwt.sign({
            id: user.id,
            email: user.email,
            role: user.role
          });

          return {
            message: "Login berhasil",
            token,
            user: { id: user.id, email: user.email, name: user.name, role: user.role }
          };
        },
        {
          body: t.Object({
            email: t.String(),
            password: t.String()
          })
        }
      )
      .get("/me", async ({ headers, jwt, set }) => {
        const auth = headers["authorization"];
        if (!auth || !auth.startsWith("Bearer ")) {
          set.status = 401;
          return { error: "Token tidak ditemukan" };
        }
        const token = auth.replace("Bearer ", "");
        const payload = await jwt.verify(token);
        if (!payload) {
          set.status = 401;
          return { error: "Token tidak valid" };
        }
        const user = await db.user.findUnique({
          where: { id: (payload as any).id },
          select: { id: true, email: true, name: true, role: true }
        });
        return { user };
      })
  )

  // --- MEMBER (PENGUNJUNG TERDAFTAR) AUTH ENDPOINTS ---
  .group("/api/member", (group) =>
    group
      .post(
        "/register",
        async ({ body, jwt, set }) => {
          const { username, password } = body;
          const trimmedUsername = username.trim().toLowerCase();

          const existing = await db.user.findUnique({
            where: { username: trimmedUsername }
          });
          if (existing) {
            set.status = 400;
            return { error: "Username sudah digunakan, silakan pilih yang lain." };
          }

          const hashedPassword = await Bun.password.hash(password);
          const member = await db.user.create({
            data: {
              username: trimmedUsername,
              name: username.trim(),
              password: hashedPassword,
              role: "MEMBER"
            }
          });

          const token = await jwt.sign({
            id: member.id,
            username: member.username,
            role: member.role
          });

          return {
            message: "Pendaftaran member sukses!",
            token,
            member: {
              id: member.id,
              username: member.username,
              name: member.name,
              role: member.role
            }
          };
        },
        {
          body: t.Object({
            username: t.String(),
            password: t.String()
          })
        }
      )
      .post(
        "/login",
        async ({ body, jwt, set }) => {
          const { username, password } = body;
          const trimmedUsername = username.trim().toLowerCase();

          const member = await db.user.findUnique({
            where: { username: trimmedUsername }
          });
          if (!member || member.role !== "MEMBER") {
            set.status = 401;
            return { error: "Username atau password salah" };
          }

          const isMatch = await Bun.password.verify(password, member.password);
          if (!isMatch) {
            set.status = 401;
            return { error: "Username atau password salah" };
          }

          const token = await jwt.sign({
            id: member.id,
            username: member.username,
            role: member.role
          });

          return {
            message: "Login member sukses!",
            token,
            member: {
              id: member.id,
              username: member.username,
              name: member.name,
              role: member.role
            }
          };
        },
        {
          body: t.Object({
            username: t.String(),
            password: t.String()
          })
        }
      )
  )

  // --- PROJECT MANAGEMENT (DASHBOARD - ADMIN ONLY) ---
  .group("/api/projects", (group) =>
    group
      .get("/", async ({ headers, jwt, set }) => {
        const auth = headers["authorization"];
        if (!auth?.startsWith("Bearer ")) {
          set.status = 401;
          return { error: "Unauthorized" };
        }
        const payload = (await jwt.verify(auth.replace("Bearer ", ""))) as any;
        if (!payload || (payload.role !== "ADMIN" && payload.role !== "AGENT")) {
          set.status = 403;
          return { error: "Akses ditolak: Hanya Admin yang diizinkan" };
        }
        const projects = await db.project.findMany({
          where: { ownerId: payload.id },
          include: {
            _count: {
              select: { sessions: true }
            }
          },
          orderBy: { createdAt: "desc" }
        });
        return { projects };
      })
      .post(
        "/",
        async ({ body, headers, jwt, set }) => {
          const auth = headers["authorization"];
          if (!auth?.startsWith("Bearer ")) {
            set.status = 401;
            return { error: "Unauthorized" };
          }
          const payload = (await jwt.verify(auth.replace("Bearer ", ""))) as any;
          if (!payload || (payload.role !== "ADMIN" && payload.role !== "AGENT")) {
            set.status = 403;
            return { error: "Akses ditolak: Hanya Admin yang diizinkan" };
          }
          const project = await db.project.create({
            data: {
              name: body.name,
              domain: body.domain || "*",
              ownerId: payload.id
            }
          });
          return { project };
        },
        {
          body: t.Object({
            name: t.String(),
            domain: t.Optional(t.String())
          })
        }
      )
  )

  // --- SESSIONS & MESSAGES (DASHBOARD - ADMIN ONLY) ---
  .group("/api/sessions", (group) =>
    group
      .get("/by-project/:projectId", async ({ params, headers, jwt, set }) => {
        const auth = headers["authorization"];
        if (!auth?.startsWith("Bearer ")) {
          set.status = 401;
          return { error: "Unauthorized" };
        }
        const payload = (await jwt.verify(auth.replace("Bearer ", ""))) as any;
        if (!payload || (payload.role !== "ADMIN" && payload.role !== "AGENT")) {
          set.status = 403;
          return { error: "Akses ditolak: Hanya Admin yang diizinkan" };
        }
        const { projectId } = params;
        const sessions = await db.chatSession.findMany({
          where: { projectId },
          include: {
            messages: {
              orderBy: { createdAt: "desc" },
              take: 1
            }
          },
          orderBy: { updatedAt: "desc" }
        });
        return { sessions };
      })
      .get("/:sessionId/messages", async ({ params }) => {
        const messages = await db.message.findMany({
          where: { sessionId: params.sessionId },
          orderBy: { createdAt: "asc" }
        });
        return { messages };
      })
  )

  // --- WIDGET & PUBLIC ROOM API ---
  .group("/api/widget", (group) =>
    group
      .get("/init", async ({ query, set }) => {
        const token = query.token;
        if (!token) {
          set.status = 400;
          return { error: "Widget token wajib disertakan" };
        }
        const project = await db.project.findUnique({
          where: { widgetToken: token },
          select: { id: true, name: true, domain: true, widgetToken: true }
        });
        if (!project) {
          set.status = 404;
          return { error: "Project / Room tidak ditemukan" };
        }
        return { project };
      })
      .post(
        "/session",
        async ({ body, set }) => {
          const { widgetToken, visitorId, visitorName, memberId } = body;
          const project = await db.project.findUnique({
            where: { widgetToken }
          });
          if (!project) {
            set.status = 404;
            return { error: "Project / Room tidak ditemukan" };
          }

          let session = null;

          // 1. Jika ini MEMBER terdaftar, cari sesi milik member ini (CHAT HISTORY PERMANEN)
          if (memberId) {
            session = await db.chatSession.findFirst({
              where: {
                projectId: project.id,
                memberId: memberId,
                status: "OPEN"
              },
              include: {
                messages: {
                  orderBy: { createdAt: "asc" }
                }
              }
            });
          }

          // 2. Jika bukan member atau belum ada sesi member, cari sesi berdasarkan visitorId anonim
          if (!session && visitorId) {
            session = await db.chatSession.findFirst({
              where: {
                projectId: project.id,
                visitorId: visitorId,
                status: "OPEN"
              },
              include: {
                messages: {
                  orderBy: { createdAt: "asc" }
                }
              }
            });
          }

          // 3. Jika belum pernah ada sesi sama sekali, buat sesi baru
          if (!session) {
            session = await db.chatSession.create({
              data: {
                projectId: project.id,
                visitorId: visitorId || "anon",
                visitorName: visitorName || "Pengunjung",
                memberId: memberId || null,
                status: "OPEN"
              },
              include: {
                messages: true
              }
            });
          }

          return { session };
        },
        {
          body: t.Object({
            widgetToken: t.String(),
            visitorId: t.Optional(t.String()),
            visitorName: t.Optional(t.String()),
            memberId: t.Optional(t.String())
          })
        }
      )
  )

  // --- WEBSOCKET FOR REALTIME CHAT ---
  .ws("/ws", {
    body: t.Object({
      type: t.String(),
      sessionId: t.String(),
      senderType: t.String(), // "VISITOR" | "AGENT" | "MEMBER"
      senderId: t.String(),
      content: t.Optional(t.String()),
      attachmentUrl: t.Optional(t.String())
    }),
    open(ws) {
      // client connected
    },
    async message(ws, message) {
      const { type, sessionId, senderType, senderId, content, attachmentUrl } = message;

      if (type === "join") {
        ws.subscribe(`session-${sessionId}`);
        ws.send({
          type: "joined",
          sessionId,
          message: "Terhubung ke ruang obrolan"
        });
        return;
      }

      if (type === "message" && (content || attachmentUrl)) {
        // Simpan pesan ke MySQL
        const finalSenderType =
          senderType === "AGENT"
            ? "AGENT"
            : senderType === "MEMBER"
            ? "MEMBER"
            : "VISITOR";

        const savedMessage = await db.message.create({
          data: {
            sessionId,
            senderType: finalSenderType as any,
            senderId,
            content: content || "",
            attachmentUrl: attachmentUrl || null
          }
        });

        // Update waktu aktif di chat session
        await db.chatSession.update({
          where: { id: sessionId },
          data: { updatedAt: new Date() }
        });

        // Broadcast pesan ke seluruh subscriber room sesi ini
        ws.publish(`session-${sessionId}`, {
          type: "new_message",
          message: savedMessage
        });

        // Kirim konfirmasi ke pengirim
        ws.send({
          type: "new_message",
          message: savedMessage
        });
      }
    },
    close(ws) {
      // client disconnected
    }
  })
  .listen(process.env.PORT || 4000);

console.log(`🦊 Elysia LiveChat Server berjalan di http://localhost:${app.server?.port}`);
