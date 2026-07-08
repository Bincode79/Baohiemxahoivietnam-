import { Router } from "express";
import { query, withTransaction } from "../db";
import { scryptHash, scryptVerify } from "../crypto";
import { randomToken, getTokenStore } from "../session";
import { validateRegisterPayload, validateLoginPayload, normalizeBirthDate, normalizePhone } from "../validation";
import { successResponse, errorResponse } from "../types/response";
import { persistImage } from "../storage";
import { encryptSensitive } from "../encryption";
import type { Request, Response } from "express";

const router = Router();

// Admin auth middleware
export async function adminAuth(req: Request, res: Response, next: () => void) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json(errorResponse("Unauthorized", "UNAUTHORIZED"));
  }
  const token = authHeader.slice(7);
  const store = getTokenStore();

  const adminSession = await store.getAdmin(token);
  if (adminSession) {
    req.admin = adminSession;
    return next();
  }

  const userSession = await store.getUser(token);
  if (userSession && userSession.role === "admin") {
    req.admin = { id: userSession.userId, username: "", role: "admin" };
    return next();
  }

  return res.status(401).json(errorResponse("Unauthorized", "UNAUTHORIZED"));
}

async function getAdminByCredentials(username: string, password: string) {
  const { rows } = await query(
    "SELECT id, username, role FROM admins WHERE username = $1 LIMIT 1",
    [username]
  );
  const admin = rows[0];
  if (!admin) return null;
  const { rows: hashRows } = await query(
    "SELECT password_hash FROM admins WHERE id = $1 LIMIT 1",
    [admin.id]
  );
  const storedHash = hashRows[0]?.password_hash || "";
  if (!storedHash) return null;
  const ok = await scryptVerify(password, storedHash);
  if (!ok) return null;
  return admin;
}

// POST /api/register
router.post("/register", async (req: Request, res: Response) => {
  const body = req.body || {};
  const validation = validateRegisterPayload(body);
  if (!validation.ok) {
    const firstMessage = (validation.errors as Record<string, string>)[validation.field as string] || "Dữ liệu không hợp lệ";
    return res.status(400).json(errorResponse(firstMessage, "VALIDATION_ERROR", validation.field, validation.errors));
  }

  const validBody = (validation as any).data;
  const now = new Date().toISOString().replace("T", " ").substring(0, 19);
  const passwordHash = await scryptHash(validBody.Password);
  const phone = normalizePhone(validBody.Phone);
  const birthDate = normalizeBirthDate(validBody.BirthDate);
  const accountType = validBody.AccountType;
  const isOrg = accountType === "organization";
  const paymentMethod = validBody.PaymentMethod;
  const photoData = (validation as { ok: true; images: { photo: string; cccdFront: string; cccdBack: string } }).images;
  const photo = photoData.photo;
  const cccdFront = photoData.cccdFront;
  const cccdBack = photoData.cccdBack;
  const storeOnDisk = process.env.STORE_IMAGES_ON_DISK === "true";

  try {
    const userId = await withTransaction(async (client) => {
        const dupBhxh = await client.query(
          "SELECT id FROM users WHERE bhxh_code = $1 LIMIT 1", [validBody.BhxhCode]
        );
        if (dupBhxh.rows.length > 0) {
          throw { status: 409, field: "BhxhCode", error: "Mã số BHXH đã được đăng ký" };
        }
        const dupCccd = await client.query(
          "SELECT id FROM users WHERE cccd = $1 LIMIT 1", [validBody.IdNumber]
        );
        if (dupCccd.rows.length > 0) {
          throw { status: 409, field: "IdNumber", error: "Số CCCD đã được đăng ký" };
        }
        const dupPhone = await client.query(
          "SELECT id FROM users WHERE phone = $1 LIMIT 1", [phone]
        );
        if (dupPhone.rows.length > 0) {
          throw { status: 409, field: "Phone", error: "Số điện thoại đã được đăng ký" };
        }
        if (isOrg && validBody.TaxCode) {
          const dupTax = await client.query(
            "SELECT id FROM users WHERE tax_code = $1 LIMIT 1", [validBody.TaxCode]
          );
          if (dupTax.rows.length > 0) {
            throw { status: 409, field: "TaxCode", error: "Mã số thuế đã được đăng ký" };
          }
        }

        const userResult = await client.query(
          `INSERT INTO users (
            full_name, bhxh_code, cccd, phone, email, account_type, status, registered_at,
            province, ward, street, gender, ethnicity, birth_date,
            payment_method, bank_name, bank_bin, bank_account_name, bank_account_number,
            registration_location, receiving_agency, password_hash,
            photo_data, cccd_front_data, cccd_back_data,
            photo_path, cccd_front_path, cccd_back_path,
            tax_code, representative_name, representative_position, representative_phone, representative_email,
            created_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, 'pending', $7,
            $8, $9, $10, $11, $12, $13,
            $14, $15, $16, $17, $18,
            $19, $20, $21,
            $22, $23, $24,
            $25, $26, $27,
            $28, $29, $30, $31, $32,
            NOW()
          ) RETURNING id`,
          [
            validBody.FullName, validBody.BhxhCode, validBody.IdNumber, phone, validBody.Email || "",
            accountType, now,
            validBody.Province, validBody.Ward || "", validBody.Street,
            validBody.Gender, validBody.Ethnicity || "", birthDate,
            paymentMethod,
            paymentMethod === "cash" ? "" : (validBody.BankName || ""),
            paymentMethod === "cash" ? "" : (validBody.BankBin || ""),
            paymentMethod === "cash" ? "" : (validBody.BankAccountName || ""),
            paymentMethod === "cash" ? "" : (validBody.BankAccountNumber || ""),
            validBody.RegistrationLocation || "portal", validBody.ReceivingAgency, passwordHash,
            storeOnDisk ? "" : (photo || ""),
            storeOnDisk ? "" : (cccdFront || ""),
            storeOnDisk ? "" : (cccdBack || ""),
            "", "", "",  // path placeholder, cập nhật ngay sau khi INSERT
            isOrg ? (validBody.TaxCode || "") : "",
            isOrg ? (validBody.RepresentativeName || "") : "",
            isOrg ? (validBody.RepresentativePosition || "") : "",
            isOrg ? normalizePhone(validBody.RepresentativePhone || "") : "",
            isOrg ? (validBody.RepresentativeEmail || "") : "",
          ]
        );

        const capturedUserId: number = userResult.rows[0].id;

        // P3.23: Mã hóa CCCD + phone bằng pgcrypto (AES-256-CBC) nếu ENCRYPT_SENSITIVE=true.
        if (process.env.ENCRYPT_SENSITIVE === "true") {
          const { cccdEnc, phoneEnc } = await encryptSensitive(
            client,
            validBody.IdNumber,
            phone
          );
          await client.query(
            `UPDATE users SET cccd_encrypted = $1, phone_encrypted = $2 WHERE id = $3`,
            [cccdEnc, phoneEnc, capturedUserId]
          );
        }

        // P1.5: nếu bật STORE_IMAGES_ON_DISK, persist ảnh xuống disk sau khi đã có userId.
        if (storeOnDisk) {
          const photoPath = photo ? await persistImage(photo, "photo", String(capturedUserId)) : null;
          const frontPath = cccdFront ? await persistImage(cccdFront, "cccd-front", String(capturedUserId)) : null;
          const backPath = cccdBack ? await persistImage(cccdBack, "cccd-back", String(capturedUserId)) : null;
          await client.query(
            `UPDATE users SET photo_path = $1, cccd_front_path = $2, cccd_back_path = $3 WHERE id = $4`,
            [photoPath || "", frontPath || "", backPath || "", capturedUserId]
          );
        }

        if (paymentMethod === "transfer" && validBody.BankBin) {
          await client.query(
            `INSERT INTO user_qr_settings (user_id, qr_enabled, qr_bank_bin, qr_bank_name, qr_account, qr_holder, qr_payment_type, created_at, updated_at)
             VALUES ($1, FALSE, $2, $3, $4, $5, 'bhxh', $6, $6)`,
            [
              capturedUserId,
              validBody.BankBin,
              validBody.BankName || "",
              validBody.BankAccountNumber || "",
              validBody.BankAccountName || "",
              now,
            ]
          );
        }

        return capturedUserId;
      });

    res.status(201).json(successResponse({ userId }, "Đăng ký thành công! Hồ sơ của bạn đang chờ xét duyệt."));
  } catch (err: unknown) {
    const error = err as { status?: number; field?: string; error?: string; code?: string; constraint?: string };
    if (error && error.status) {
      return res.status(error.status).json(errorResponse(error.error!, "DUPLICATE", error.field));
    }
    if (error && error.code === "23505") {
      const constraint = error.constraint || "";
      let field = "BhxhCode";
      let msg = "Thông tin đăng ký đã tồn tại";
      if (constraint.includes("phone")) { field = "Phone"; msg = "Số điện thoại đã được đăng ký"; }
      else if (constraint.includes("cccd")) { field = "IdNumber"; msg = "Số CCCD đã được đăng ký"; }
      else if (constraint.includes("tax_code")) { field = "TaxCode"; msg = "Mã số thuế đã được đăng ký"; }
      else if (constraint.includes("bhxh_code")) { field = "BhxhCode"; msg = "Mã số BHXH đã được đăng ký"; }
      return res.status(409).json(errorResponse(msg, "DUPLICATE", field));
    }
    res.status(500).json(errorResponse((err as Error).message, "INTERNAL_ERROR"));
  }
});

// POST /api/admin/login
router.post("/admin/login", async (req: Request, res: Response) => {
  const { username, password } = req.body || {};
  try {
    const admin = await getAdminByCredentials(username, password);
    if (!admin) {
      console.warn(`[AUTH] Failed admin login attempt for username: ${username}, IP: ${req.ip}`);
      return res.status(401).json(errorResponse("Sai tên đăng nhập hoặc mật khẩu!", "AUTH_FAILED"));
    }
    const token = randomToken();
    const store = getTokenStore();
    await store.setAdmin(token, { id: admin.id, username: admin.username, role: admin.role });
    res.json(successResponse({ token, role: admin.role }));
  } catch (err) {
    res.status(500).json(errorResponse((err as Error).message, "INTERNAL_ERROR"));
  }
});

// POST /api/admin/logout
router.post("/admin/logout", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const store = getTokenStore();
    await store.deleteAdmin(authHeader.slice(7));
  }
  res.json(successResponse(null, "Đăng xuất thành công"));
});

// GET /api/admin/check
router.get("/admin/check", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.json(successResponse({ authenticated: false }));
  }
  const token = authHeader.slice(7);
  const store = getTokenStore();
  const session = await store.getAdmin(token);
  if (session) {
    return res.json(successResponse({ authenticated: true, role: session.role, username: session.username }));
  }
  res.json(successResponse({ authenticated: false }));
});

// POST /api/auth/login
router.post("/login", async (req: Request, res: Response) => {
  const body = req.body || {};
  const validation = validateLoginPayload(body);
  if (!validation.ok) {
    const firstMessage = validation.errors.username || validation.errors.password || "Dữ liệu không hợp lệ";
    return res.status(400).json(errorResponse(firstMessage, "VALIDATION_ERROR"));
  }
  const { username, password } = body;
  const store = getTokenStore();

  // Admin login
  const admin = await getAdminByCredentials(username, password);
  if (admin) {
    const token = randomToken();
    await store.setAdmin(token, { id: admin.id, username: admin.username, role: admin.role });
    return res.json(successResponse({ token, role: "admin", redirect: "/quan-tri" }));
  }

  try {
    const { rows } = await query(
      "SELECT id, full_name, bhxh_code, status, password_hash FROM users WHERE bhxh_code = $1 OR cccd = $1 LIMIT 1",
      [username]
    );

    const user = rows[0];
    const storedHash = user?.password_hash || "";
    // Timing-safe comparison
    const fakeHash = "scrypt$" + "0".repeat(32) + "$" + "0".repeat(128);
    await scryptVerify(password, fakeHash);
    if (!user || !storedHash) {
      console.warn(`[AUTH] Failed login - user not found: ${username}, IP: ${req.ip}`);
      return res.status(401).json(errorResponse("Sai tên đăng nhập hoặc mật khẩu!", "AUTH_FAILED"));
    }
    const ok = await scryptVerify(password, storedHash);
    if (!ok) {
      console.warn(`[AUTH] Failed login - wrong password: ${username}, IP: ${req.ip}`);
      return res.status(401).json(errorResponse("Sai tên đăng nhập hoặc mật khẩu!", "AUTH_FAILED"));
    }
    if (user.status !== "approved") {
      const msg = user.status === "rejected"
        ? "Tài khoản đã bị từ chối! Vui lòng liên hệ hỗ trợ."
        : "Tài khoản chưa được phê duyệt!";
      return res.status(403).json(errorResponse(msg, user.status === "rejected" ? "REJECTED" : "NOT_APPROVED"));
    }
    const token = randomToken();
    await store.setUser(token, { role: "user", userId: user.id });
    res.json(successResponse({ token, role: "user", user: { id: user.id, fullName: user.full_name, bhxhCode: user.bhxh_code } }));
  } catch (err) {
    res.status(500).json(errorResponse((err as Error).message, "INTERNAL_ERROR"));
  }
});

// GET /api/auth/check
router.get("/check", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.json(successResponse({ authenticated: false }));
  }
  const token = authHeader.substring(7);
  const store = getTokenStore();

  const adminData = await store.getAdmin(token);
  if (adminData) {
    return res.json(successResponse({ authenticated: true, role: "admin" }));
  }

  const userData = await store.getUser(token);
  if (userData) {
    return res.json(successResponse({ authenticated: true, role: userData.role }));
  }

  res.json(successResponse({ authenticated: false }));
});

export { router as authRoutes };
