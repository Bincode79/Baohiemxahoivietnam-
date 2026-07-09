/**
 * Encryption utilities sử dụng pgcrypto của PostgreSQL.
 * Các trường nhạy cảm (CCCD, SĐT) được mã hóa khi lưu vào DB.
 *
 * Encryption key được lấy từ env ENCRYPT_KEY (bắt buộc khi bật tính năng).
 * Thuật toán: AES-256-CBC (pgp_sym_encrypt / pgp_sym_decrypt từ pgcrypto).
 *
 * Lưu ý: pgcrypto cần được enable trong PostgreSQL:
 *   CREATE EXTENSION IF NOT EXISTS pgcrypto;
 * (đã thêm trong db.ts migration).
 */

import { query } from "./db";

const ENCRYPT_KEY = process.env.ENCRYPT_KEY || "";
const ENCRYPT_ENABLED = process.env.ENCRYPT_SENSITIVE === "true";

if (ENCRYPT_ENABLED && !ENCRYPT_KEY) {
  throw new Error(
    "[ENCRYPT] ENCRYPT_KEY must be set when ENCRYPT_SENSITIVE=true. " +
    "Generate with: openssl rand -hex 32"
  );
}

export async function pgEncrypt(plaintext: string): Promise<string> {
  if (!plaintext) return "";
  if (!ENCRYPT_ENABLED) return plaintext;
  const result = await query(
    "SELECT pgp_sym_encrypt($1, $2, 'ciphertext_version=1') AS ct",
    [plaintext, ENCRYPT_KEY]
  );
  return (result.rows[0] as { ct: string }).ct;
}

export async function pgDecrypt(ciphertext: string): Promise<string> {
  if (!ciphertext) return "";
  if (!ENCRYPT_ENABLED) return ciphertext;
  const result = await query(
    "SELECT pgp_sym_decrypt($1, $2) AS pt",
    [ciphertext, ENCRYPT_KEY]
  );
  return (result.rows[0] as { pt: string }).pt;
}

export async function encryptSensitive(
  client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
  cccd: string,
  phone: string
): Promise<{ cccdEnc: string; phoneEnc: string }> {
  if (!ENCRYPT_ENABLED) {
    return { cccdEnc: cccd, phoneEnc: phone };
  }
  const [cccdResult, phoneResult] = await Promise.all([
    client.query(
      "SELECT pgp_sym_encrypt($1, $2, 'ciphertext_version=1') AS ct",
      [cccd, ENCRYPT_KEY]
    ),
    client.query(
      "SELECT pgp_sym_encrypt($1, $2, 'ciphertext_version=1') AS ct",
      [phone, ENCRYPT_KEY]
    ),
  ]);
  return {
    cccdEnc: (cccdResult.rows[0] as { ct: string })?.ct || cccd,
    phoneEnc: (phoneResult.rows[0] as { ct: string })?.ct || phone,
  };
}

export async function decryptSensitive(
  cccdEnc: string,
  phoneEnc: string
): Promise<{ cccd: string; phone: string }> {
  if (!ENCRYPT_ENABLED) {
    return { cccd: cccdEnc, phone: phoneEnc };
  }
  try {
    const [cccdResult, phoneResult] = await Promise.all([
      cccdEnc
        ? query("SELECT pgp_sym_decrypt($1, $2) AS pt", [cccdEnc, ENCRYPT_KEY])
        : Promise.resolve({ rows: [{ pt: "" }] }),
      phoneEnc
        ? query("SELECT pgp_sym_decrypt($1, $2) AS pt", [phoneEnc, ENCRYPT_KEY])
        : Promise.resolve({ rows: [{ pt: "" }] }),
    ]);
    return {
      cccd: (cccdResult.rows[0] as { pt: string })?.pt || "",
      phone: (phoneResult.rows[0] as { pt: string })?.pt || "",
    };
  } catch {
    return { cccd: "***", phone: "***" };
  }
}
