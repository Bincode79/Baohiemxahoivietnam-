import { scrypt, randomBytes, timingSafeEqual, randomUUID } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number
) => Promise<Buffer>;

const SCRYPT_KEYLEN = 64;
const SCRYPT_SALT_BYTES = 16;
const SCRYPT_HASH_PREFIX = "scrypt$";

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 64;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,64}$/;

export function validatePasswordStrength(password: string): { ok: boolean; message: string } {
  if (!password) {
    return { ok: false, message: "Mật khẩu không được để trống" };
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, message: `Mật khẩu phải có ít nhất ${PASSWORD_MIN_LENGTH} ký tự` };
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return { ok: false, message: `Mật khẩu không được vượt quá ${PASSWORD_MAX_LENGTH} ký tự` };
  }
  if (!PASSWORD_REGEX.test(password)) {
    return {
      ok: false,
      message: "Mật khẩu phải có chữ thường, chữ hoa và chữ số",
    };
  }
  return { ok: true, message: "" };
}

export async function scryptHash(password: string): Promise<string> {
  const salt = randomBytes(SCRYPT_SALT_BYTES);
  const derived = await scryptAsync(password, salt, SCRYPT_KEYLEN);
  return SCRYPT_HASH_PREFIX + salt.toString("hex") + "$" + derived.toString("hex");
}

export async function scryptVerify(password: string, stored: string): Promise<boolean> {
  if (!stored || !stored.startsWith(SCRYPT_HASH_PREFIX)) {
    return false;
  }
  const parts = stored.slice(SCRYPT_HASH_PREFIX.length).split("$");
  if (parts.length !== 2) return false;
  const saltHex = parts[0];
  const hashHex = parts[1];
  if (!saltHex || !hashHex) return false;
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltHex, "hex");
    expected = Buffer.from(hashHex, "hex");
  } catch {
    return false;
  }
  if (expected.length !== SCRYPT_KEYLEN) return false;
  const derived = await scryptAsync(password, salt, expected.length);
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

export function randomToken(): string {
  return randomUUID().replace(/-/g, "") + randomBytes(8).toString("hex");
}
