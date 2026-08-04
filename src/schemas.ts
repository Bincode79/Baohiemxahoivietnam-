import { z } from "zod";

// Common regex patterns
const CCCD_REGEX = /^\d{12}$/;
const PHONE_REGEX = /^(0[235789]\d{8}|01[2-9]\d{7})$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BHXH_REGEX = /^\d{10}$|^\d{13}$/;
const BANK_BIN_REGEX = /^\d{6}$/;
const TAX_CODE_REGEX = /^\d{10}$|^\d{13}$/;
const BIRTHDATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const BhxhCodeSchema = z.string()
  .min(1, "Mã số BHXH không được để trống")
  .regex(BHXH_REGEX, "Mã số BHXH phải gồm 10 hoặc 13 chữ số");

export const CccdSchema = z.string()
  .regex(CCCD_REGEX, "Số CCCD phải gồm đúng 12 chữ số");

export const PhoneSchema = z.string()
  .regex(PHONE_REGEX, "Số điện thoại không hợp lệ");

export const EmailSchema = z.string()
  .regex(EMAIL_REGEX, "Địa chỉ email không hợp lệ")
  .or(z.literal("").transform(() => ""));

export const BirthDateSchema = z.string()
  .regex(BIRTHDATE_REGEX, "Ngày sinh phải có định dạng yyyy-mm-dd");

export const BankBinSchema = z.string()
  .regex(BANK_BIN_REGEX, "Mã BIN ngân hàng phải gồm 6 chữ số")
  .or(z.literal(""));

export const TaxCodeSchema = z.string()
  .regex(TAX_CODE_REGEX, "Mã số thuế phải gồm 10 hoặc 13 chữ số")
  .or(z.literal(""));

const maxBytes = (n: number) =>
  z.string().refine(
    (v) => new TextEncoder().encode(v).length <= n,
    `Dữ liệu ảnh vượt quá ${Math.round(n / 1024 / 1024)} MB`
  );

const MAX_PHOTO_BYTES = 2 * 1024 * 1024; // 2 MB

// ─── Register ─────────────────────────────────────────────────────────────────

const BankInfoSchema = z.object({
  BankBin: BankBinSchema.optional(),
  BankName: z.string().max(100).optional(),
  BankAccountNumber: z.string().max(20).optional(),
  BankAccountName: z.string().max(200).optional(),
});

export const RegisterPayloadSchema = z.object({
  FullName: z.string().min(2, "Họ tên phải từ 2 ký tự").max(200),
  BhxhCode: BhxhCodeSchema,
  IdNumber: CccdSchema,
  Phone: PhoneSchema,
  Email: EmailSchema,
  AccountType: z.enum(["individual", "organization"]),
  Province: z.string().min(1, "Tỉnh/Thành phố không được để trống"),
  Ward: z.string().optional().transform((v) => v || ""),
  Street: z.string().max(500),
  Gender: z.string().max(20).optional().transform((v) => v || ""),
  Ethnicity: z.string().max(50).optional().transform((v) => v || ""),
  BirthDate: BirthDateSchema.optional().transform((v) => v || ""),
  PaymentMethod: z.enum(["cash", "transfer"]).default("transfer"),
  TaxCode: TaxCodeSchema.optional(),
  RepresentativeName: z.string().max(200).optional().transform((v) => v || ""),
  RepresentativePosition: z.string().max(100).optional().transform((v) => v || ""),
  RepresentativePhone: PhoneSchema.optional().transform((v) => v || ""),
  RepresentativeEmail: EmailSchema.optional().transform((v) => v || ""),
  ReceivingAgency: z.string().optional().transform((v) => v || ""),
  RegistrationLocation: z.string().optional().transform((v) => v || "portal"),
  Password: z.string()
    .min(8, "Mật khẩu phải từ 8 ký tự")
    .max(128, "Mật khẩu quá dài"),
  Photo: maxBytes(MAX_PHOTO_BYTES).optional().or(z.literal("")),
  CccdFront: maxBytes(MAX_PHOTO_BYTES).optional().or(z.literal("")),
  CccdBack: maxBytes(MAX_PHOTO_BYTES).optional().or(z.literal("")),
}).merge(BankInfoSchema);

// ─── Login ───────────────────────────────────────────────────────────────────

export const LoginPayloadSchema = z.object({
  username: z.string().min(1, "Tên đăng nhập không được để trống"),
  password: z.string().min(1, "Mật khẩu không được để trống"),
});

// ─── Appointment ─────────────────────────────────────────────────────────────

export const AppointmentPayloadSchema = z.object({
  fullName: z.string().min(2).max(200),
  phone: PhoneSchema,
  email: EmailSchema,
  bhxhCode: z.string().max(20).optional().transform((v) => v || ""),
  date: z.string().regex(BIRTHDATE_REGEX, "Ngày hẹn phải có định dạng yyyy-mm-dd"),
  timeSlot: z.string().max(50).optional().transform((v) => v || ""),
  service: z.string().max(50).optional().transform((v) => v || ""),
  note: z.string().max(1000).optional().transform((v) => v || ""),
});

// ─── Admin status update ─────────────────────────────────────────────────────

export const AdminStatusSchema = z.object({
  status: z.enum(["pending", "approved", "rejected"]),
  note: z.string().max(500).optional().transform((v) => v || ""),
});

// ─── VietQR generate ──────────────────────────────────────────────────────────

export const VietQRGenerateSchema = z.object({
  bankBin: z.string().regex(BANK_BIN_REGEX, "Mã BIN không hợp lệ"),
  accountNumber: z.string().min(1).max(20),
  accountName: z.string().min(1).max(200),
  amount: z.string().regex(/^\d+$/).default("0"),
  content: z.string().max(50).optional().default(""),
  merchantCity: z.string().max(40).optional().default("HANOI"),
});
