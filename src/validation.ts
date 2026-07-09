import { z } from "zod";
import { PROVINCES } from "./data/provinces";

export function normalizeBirthDate(value: string): string {
  if (!value) return "";
  // Handle dd/mm/yyyy (client format) → YYYY-MM-DD (server format)
  const ddmmyyyy = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (ddmmyyyy) return `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;
  // Handle dd-mm-yyyy 
  const ddmmyyyy2 = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (ddmmyyyy2) return `${ddmmyyyy2[3]}-${ddmmyyyy2[2]}-${ddmmyyyy2[1]}`;
  // Already YYYY-MM-DD
  const cleaned = value.replace(/\//g, "-");
  const match = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return cleaned;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

export function normalizePhone(value: string): string {
  if (!value) return "";
  const cleaned = value.replace(/[.\s-]/g, "");
  if (!cleaned.startsWith("0") && cleaned.length === 9) return "0" + cleaned;
  return cleaned;
}

// ─── Zod schemas (P2.20) ────────────────────────────────────────────────────

const MAX_PHOTO_BYTES = 2 * 1024 * 1024; // 2 MB
const CCCD_REGEX = /^\d{9,12}$/;  // 9 (CMND cũ) hoặc 12 (CCCD mới)
const PHONE_REGEX = /^(0[235789]\d{8}|01[2-9]\d{7}|\+84[235789]\d{8})$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BHXH_REGEX = /^\d{10,13}$/;  // 10 hoặc 13 số
const BANK_BIN_REGEX = /^\d{6}$/;
const TAX_CODE_REGEX = /^\d{10}(-\d{3})?$|^\d{13}$/;
const BIRTHDATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const RegisterPayloadSchema = z.preprocess(
  // Normalize incoming data: alias PhotoData → Photo, CccdFrontData → CccdFront, CccdBackData → CccdBack
  (data: unknown) => {
    if (typeof data !== "object" || data === null) return data;
    const d = data as Record<string, unknown>;
    return {
      ...d,
      Photo: d.Photo || d.PhotoData || "",
      CccdFront: d.CccdFront || d.CccdFrontData || "",
      CccdBack: d.CccdBack || d.CccdBackData || "",
      // Normalize BirthDate dd/mm/yyyy → YYYY-MM-DD before Zod parses
      BirthDate: (() => {
        const v = String(d.BirthDate || "");
        const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (m) return `${m[3]}-${m[2]}-${m[1]}`;
        const m2 = v.match(/^(\d{2})-(\d{2})-(\d{4})$/);
        if (m2) return `${m2[3]}-${m2[2]}-${m2[1]}`;
        return v;
      })(),
    };
  },
  z.object({
  FullName: z.string().min(2).max(200),
  BhxhCode: z.string().regex(BHXH_REGEX, "Mã số BHXH phải gồm 10 hoặc 13 chữ số"),
  IdNumber: z.string().regex(CCCD_REGEX, "Số CCCD/CMND phải gồm 9-12 chữ số"),
  Phone: z.string().regex(PHONE_REGEX, "Số điện thoại không hợp lệ"),
  Email: z.string().regex(EMAIL_REGEX).or(z.literal("")).transform((v) => v),
  AccountType: z.enum(["individual", "organization"]),
  Province: z.string().refine((val) => PROVINCES.some((p) => p.code === val), {
    message: "Mã tỉnh/thành phố không hợp lệ",
  }),
  Ward: z.string().optional().default(""),
  Street: z.string().max(500),
  Gender: z.string().max(20).optional().default(""),
  Ethnicity: z.string().max(50).optional().default(""),
  BirthDate: z.string().regex(BIRTHDATE_REGEX).optional().default(""),
  PaymentMethod: z.enum(["cash", "transfer"]).default("transfer"),
  TaxCode: z.string().regex(TAX_CODE_REGEX).or(z.literal("")).default(""),
  RepresentativeName: z.string().max(200).optional().default(""),
  RepresentativePosition: z.string().max(100).optional().default(""),
  RepresentativePhone: z.string().regex(PHONE_REGEX).or(z.literal("")).default(""),
  RepresentativeEmail: z.string().regex(EMAIL_REGEX).or(z.literal("")).optional().default(""),
  ReceivingAgency: z.string().optional().default(""),
  RegistrationLocation: z.string().optional().default("portal"),
  Password: z.string().min(6, "Mật khẩu phải từ 6 ký tự").max(128),
  Photo: z.string().optional().default(""),
  CccdFront: z.string().optional().default(""),
  CccdBack: z.string().optional().default(""),
  BankBin: z.string().regex(BANK_BIN_REGEX).or(z.literal("")).optional().default(""),
  BankName: z.string().max(100).optional().default(""),
  BankAccountNumber: z.string().max(20).optional().default(""),
  BankAccountName: z.string().max(200).optional().default(""),
}));

export const AppointmentPayloadSchema = z.object({
  fullName: z.string().min(2).max(200),
  phone: z.string().regex(PHONE_REGEX),
  email: z.string().regex(EMAIL_REGEX).or(z.literal("")).default(""),
  bhxhCode: z.string().max(20).optional().default(""),
  date: z.string().regex(BIRTHDATE_REGEX),
  timeSlot: z.string().max(50).optional().default(""),
  service: z.string().max(50).optional().default(""),
  note: z.string().max(1000).optional().default(""),
});

export const LoginPayloadSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

// ─── Zod → legacy adapter ─────────────────────────────────────────────────────

function zodResult<T>(
  result: z.SafeParseReturnType<unknown, T>
): { ok: false; errors: Record<string, string> } | { ok: true; data: T } {
  if (!result.success) {
    const errors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.join(".") || String(issue.path[0] || "_");
      if (!errors[path]) errors[path] = issue.message;
    }
    return { ok: false, errors };
  }
  return { ok: true, data: result.data as T };
}

export function validateRegisterPayload(body: unknown) {
  const result = RegisterPayloadSchema.safeParse(body);
  const parsed = zodResult(result);
  if (!parsed.ok) {
    const field = Object.keys(parsed.errors)[0];
    return { ok: false, errors: parsed.errors, field };
  }
  const { Photo, CccdFront, CccdBack } = parsed.data;
  if (new TextEncoder().encode(Photo).length > MAX_PHOTO_BYTES) {
    return { ok: false, errors: { Photo: "Kích thước ảnh chân dung vượt quá 2 MB" }, field: "Photo" };
  }
  if (new TextEncoder().encode(CccdFront).length > MAX_PHOTO_BYTES) {
    return { ok: false, errors: { CccdFront: "Kích thước ảnh mặt trước CCCD vượt quá 2 MB" }, field: "CccdFront" };
  }
  if (new TextEncoder().encode(CccdBack).length > MAX_PHOTO_BYTES) {
    return { ok: false, errors: { CccdBack: "Kích thước ảnh mặt sau CCCD vượt quá 2 MB" }, field: "CccdBack" };
  }
  return { ok: true, errors: {}, field: "", images: { photo: Photo, cccdFront: CccdFront, cccdBack: CccdBack }, data: parsed.data };
}

export function validateLoginPayload(body: unknown) {
  const result = LoginPayloadSchema.safeParse(body);
  if (!result.success) {
    const errors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.join(".") || "_";
      if (!errors[path]) errors[path] = issue.message;
    }
    return { ok: false, errors };
  }
  return { ok: true, errors: {} };
}

export function validateAppointmentPayload(body: unknown) {
  const result = AppointmentPayloadSchema.safeParse(body);
  if (!result.success) {
    const messages = result.error.issues.map((i) => i.message);
    return { ok: false, message: messages.join("; ") };
  }
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const d = new Date(result.data.date + "T00:00:00");
  if (d < today) return { ok: false, message: "Ngày hẹn phải từ hôm nay trở đi" };
  return { ok: true, message: "" };
}

// Legacy helper
export function strip(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}
