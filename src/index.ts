import "dotenv/config";
import express, { Request, Response } from "express";
import path from "path";
import { initDb } from "./db";
import { initTokenStore } from "./session";
import { swaggerSpec } from "./swagger";
import { publicRoutes } from "./routes/public";
import { authRoutes } from "./routes/auth";
import { adminRoutes } from "./routes/admin";
import { chatRoutes } from "./routes/chat";
import { appointmentRoutes } from "./routes/appointments";
import { vietqrRoutes } from "./routes/vietqr";
import { rateLimit, securityHeaders, cors, errorHandler, notFoundHandler, cspNonce, csrfProtect } from "./middleware";

const app = express();
const port = parseInt(process.env.PORT || "3001", 10);
const host = process.env.HOST || "0.0.0.0";
const publicPath = path.join(__dirname, "../public");
// Body size limit: ảnh base64 3 ảnh + form text ~ 4-5 MB là đủ. Trước đây 15mb,
// nhưng cho phép client gửi payload cực lớn sẽ tốn RAM và tăng rủi ro DoS.
// Cho phép cấu hình qua env để tuỳ môi trường.
const jsonLimit = process.env.JSON_BODY_LIMIT || "5mb";
// Reverse proxy / load balancer (Nginx, Cloudflare, ...). Đảm bảo req.ip
// trả về IP thật của client thay vì IP proxy, để rate-limit & log chính xác.
// Chỉ tin các hop nội bộ (loopback, RFC1918); không nên set true vì dễ bị spoof.
app.set(
  "trust proxy",
  process.env.TRUST_PROXY || "loopback, linklocal, uniquelocal"
);

// Defensive middleware: ép path /api/... về chữ thường trước khi Express routing.
// Tránh bug frontend gọi /api/Provinces trong khi route chỉ đăng ký /api/provinces.
app.use((req: Request, _res: Response, next) => {
  if (req.url.startsWith("/api/")) {
    req.url = req.url.replace(/^\/api\/([A-Z][^?#]*)/, (_m, p1: string, offset: number) => {
      const rest = req.url.slice(offset + p1.length + 5); // sau "/api/" + p1
      return "/api/" + p1.toLowerCase() + rest;
    }) as typeof req.url;
  }
  next();
});
app.use(cors);
app.use(securityHeaders);
app.use(cspNonce);
app.use(rateLimit);
app.use(express.static(publicPath));
app.use(express.json({ limit: jsonLimit }));
app.use(csrfProtect);

// API Routes
app.use("/api", publicRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/vietqr", vietqrRoutes);

// Swagger UI (P2.21): bật bằng SWAGGER=true trong .env
if (process.env.SWAGGER === "true") {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const swaggerUi = require("swagger-ui-express");
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: ".swagger-ui .topbar { display: none }",
    customSiteTitle: "BHXH API Docs",
  }));
}

// Page routes
app.get("/", (_req: Request, res: Response) => {
  res.sendFile(path.join(publicPath, "index.html"));
});

app.get("/dang-ky", (_req: Request, res: Response) => {
  res.sendFile(path.join(publicPath, "register.html"));
});

app.get("/dang-ky/thong-tin", (_req: Request, res: Response) => {
  res.sendFile(path.join(publicPath, "register-final.html"));
});

app.get("/dat-lich", (_req: Request, res: Response) => {
  res.sendFile(path.join(publicPath, "datlich.html"));
});

app.get("/quan-tri", (_req: Request, res: Response) => {
  res.sendFile(path.join(publicPath, "admin.html"));
});

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
Promise.all([initDb(), initTokenStore()])
  .then(() => {
    const server = app.listen(port, host, () => {
      console.log(`[Server] Running at http://${host}:${port}`);
    });
    // Graceful shutdown
    const shutdown = async (signal: string) => {
      console.log(`[Server] Received ${signal}, shutting down...`);
      server.close(() => console.log("[Server] HTTP closed"));
      const { getTokenStore } = await import("./session");
      await getTokenStore().shutdown();
      process.exit(0);
    };
    process.on("SIGINT", () => void shutdown("SIGINT"));
    process.on("SIGTERM", () => void shutdown("SIGTERM"));
  })
  .catch((err) => {
    console.error("[Server] Initialization failed:", err);
    process.exit(1);
  });

export default app;
