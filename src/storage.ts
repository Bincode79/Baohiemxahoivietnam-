import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";

const DATA_URL_REGEX = /^data:(image\/(jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/i;
const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");

async function ensureUploadsDir(): Promise<void> {
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
}

function parseDataUrl(value: string): { mime: string; buffer: Buffer } | null {
  const match = DATA_URL_REGEX.exec(value);
  if (!match) return null;
  const mime = match[1].toLowerCase();
  const b64 = match[3];
  try {
    return { mime, buffer: Buffer.from(b64, "base64") };
  } catch {
    return null;
  }
}

/**
 * Lưu 1 ảnh base64 (data URL) xuống disk dưới uploads/<userId|random>/<field>-<uuid>.<ext>
 * Trả về relative path dùng cho web (vd: "uploads/123/photo-abc.jpg") hoặc null nếu input không hợp lệ.
 */
export async function persistImage(
  base64OrDataUrl: string,
  fieldName: string,
  ownerDir: string
): Promise<string | null> {
  if (!base64OrDataUrl) return null;
  const parsed = parseDataUrl(base64OrDataUrl);
  if (!parsed) return null;
  const ext = EXT_BY_MIME[parsed.mime] || "bin";
  await ensureUploadsDir();
  const ownerDirAbs = path.join(UPLOADS_DIR, ownerDir);
  await fs.mkdir(ownerDirAbs, { recursive: true });
  const filename = `${fieldName}-${randomUUID()}.${ext}`;
  const fullPath = path.join(ownerDirAbs, filename);
  await fs.writeFile(fullPath, parsed.buffer, { mode: 0o640 });
  return path.posix.join("uploads", ownerDir, filename);
}

/**
 * Đọc ảnh đã lưu trên disk và trả về { buffer, mime }. Trả null nếu path không hợp lệ hoặc nằm ngoài UPLOADS_DIR.
 */
export async function readPersistedImage(
  relativePath: string
): Promise<{ buffer: Buffer; mime: string } | null> {
  if (!relativePath) return null;
  const abs = path.resolve(relativePath);
  // Path traversal guard: phải nằm trong UPLOADS_DIR
  if (!abs.startsWith(UPLOADS_DIR + path.sep) && abs !== UPLOADS_DIR) {
    return null;
  }
  try {
    const buf = await fs.readFile(abs);
    const ext = path.extname(abs).slice(1).toLowerCase();
    const mime =
      ext === "jpg" || ext === "jpeg"
        ? "image/jpeg"
        : ext === "png"
        ? "image/png"
        : ext === "webp"
        ? "image/webp"
        : "application/octet-stream";
    return { buffer: buf, mime };
  } catch {
    return null;
  }
}
