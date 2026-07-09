import type { Request, Response, NextFunction } from "express";
import { randomBytes } from "crypto";
import { errorResponse } from "../types/response";
import helmet from "helmet";

// Rate limiting
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 200;

export function rateLimit(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record || now > record.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return next();
  }

  record.count++;
  if (record.count > RATE_LIMIT_MAX_REQUESTS) {
    console.warn(`[SECURITY] Rate limit exceeded for IP: ${ip}`);
    return res.status(429).json(errorResponse("Quá nhiều yêu cầu. Vui lòng thử lại sau.", "RATE_LIMIT_EXCEEDED"));
  }
  next();
}

// CSP nonce. Đặt ở middleware để route có thể đọc res.locals.cspNonce
// và inject vào <script nonce="..."> nếu sau này muốn gỡ 'unsafe-inline'.
export function cspNonce(_req: Request, res: Response, next: NextFunction) {
  res.locals.cspNonce = randomBytes(16).toString("base64");
  next();
}

// Security headers - dùng helmet với CSP cho phép CDN và inline script.
// 'unsafe-inline' ở script-src để giữ tương thích với HTML hiện tại có nhiều inline.
// Khi refactor (bỏ inline script), bạn có thể đổi sang nonce + 'self' để CSP chặt hơn.
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'", // TODO: remove khi tách hết inline script ra file .js
        "https://cdn.jsdelivr.net",
        "https://cdnjs.cloudflare.com",
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://cdn.jsdelivr.net",
        "https://fonts.googleapis.com",
      ],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false, // ảnh từ /uploads/ và data: URL cần cho phép
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  hsts: process.env.NODE_ENV === "production"
    ? { maxAge: 60 * 60 * 24 * 180, includeSubDomains: true, preload: false }
    : false,
  noSniff: true,
  xssFilter: true,
  hidePoweredBy: true,
});

// CSP Report-Only header để thu thập vi phạm trước khi áp dụng enforce.
// Browser vẫn render page nhưng gửi report về /api/csp-report.
// Bật bằng cách đặt CSP_REPORT_ONLY=true.
export function cspReportOnly(req: Request, res: Response, next: NextFunction) {
  if (process.env.CSP_REPORT_ONLY !== "true") return next();
  const policy = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "report-uri /api/csp-report",
  ].join("; ");
  res.setHeader("Content-Security-Policy-Report-Only", policy);
  next();
}

// CORS
export function cors(req: Request, res: Response, next: NextFunction) {
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",") || ["http://localhost:3001", "http://localhost:3000"];
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
}

// Global error handler
export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);
  res.status(500).json(errorResponse("Đã xảy ra lỗi nội bộ", "INTERNAL_ERROR"));
}

// 404 handler
export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json(errorResponse("Không tìm thấy endpoint", "NOT_FOUND"));
}

// Chống CSRF cơ bản cho các endpoint state-changing (POST/PUT/DELETE/PATCH).
// 1) Yêu cầu Content-Type là JSON (form-data/html-form dễ bị CSRF hơn), HOẶC
// 2) Có header X-Requested-With: fetch (CORS preflight sẽ block các request cross-origin
//    không phải simple request).
// Lưu ý: nếu sau này cho phép upload multipart, cần bypass rule 1 cho multipart endpoints.
export function csrfProtect(req: Request, res: Response, next: NextFunction) {
  const unsafeMethod = ["POST", "PUT", "DELETE", "PATCH"].includes(req.method);
  if (!unsafeMethod) return next();
  const ctype = (req.headers["content-type"] || "").toLowerCase();
  const xrw = String(req.headers["x-requested-with"] || "").toLowerCase();
  const isJson = ctype.includes("application/json");
  const hasXrw = xrw === "fetch" || xrw === "xmlhttprequest" || xrw === "javascript";
  // Tạm thời: GET / POST public register appointment dùng JSON nên OK
  if (isJson || hasXrw) return next();
  return res.status(403).json(errorResponse("Yêu cầu bị chặn bởi CSRF protection", "CSRF_BLOCKED"));
}
