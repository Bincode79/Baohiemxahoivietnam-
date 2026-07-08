import { Router } from "express";
import { query } from "../db";
import { successResponse, errorResponse, paginatedResponse } from "../types/response";
import { adminAuth } from "./auth";
import { readPersistedImage } from "../storage";
import { logAudit } from "../audit";
import type { Request, Response } from "express";

const router = Router();

// GET /api/admin/users - Paginated users list
router.get("/users", adminAuth, async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || "20"), 10) || 20));
  const offset = (page - 1) * limit;
  const status = req.query.status as string;
  const accountType = req.query.accountType as string;
  const search = req.query.search as string;

  try {
    let whereClause = "";
    const params: unknown[] = [];
    let paramIndex = 1;

    if (status && ["pending", "approved", "rejected"].includes(status)) {
      whereClause += ` WHERE status = $${paramIndex++}`;
      params.push(status);
    }

    if (accountType && ["individual", "organization"].includes(accountType)) {
      whereClause += whereClause ? " AND" : " WHERE";
      whereClause += ` account_type = $${paramIndex++}`;
      params.push(accountType);
    }

    if (search && search.trim()) {
      // Escape các ký tự đặc biệt của LIKE: \, %, _
      // tham khảo: https://www.postgresql.org/docs/current/functions-matching.html
      const sanitized = search.trim().replace(/[\\%_]/g, (ch) => "\\" + ch);
      whereClause += whereClause ? " AND" : " WHERE";
      whereClause += ` (full_name ILIKE $${paramIndex} OR bhxh_code ILIKE $${paramIndex} OR cccd ILIKE $${paramIndex} OR phone ILIKE $${paramIndex})`;
      params.push(`%${sanitized}%`);
      paramIndex++;
    }

    const countQuery = `SELECT COUNT(*)::int as total FROM users${whereClause}`;
    const countResult = await query(countQuery, params);
    const total = countResult.rows[0]?.total || 0;

    const dataQuery = `SELECT id, full_name, bhxh_code, cccd, phone, email, account_type, status, registered_at,
              province, ward, street, gender, ethnicity, birth_date, payment_method,
              bank_name, bank_bin, bank_account_name, bank_account_number,
              registration_location, receiving_agency, tax_code,
              representative_name, representative_position, representative_phone, representative_email
       FROM users${whereClause} ORDER BY id DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    
    params.push(limit, offset);
    const { rows } = await query(dataQuery, params);

    res.json(paginatedResponse(rows, { page, limit, total }));
  } catch (err) {
    res.status(500).json(errorResponse((err as Error).message, "INTERNAL_ERROR"));
  }
});

// GET /api/admin/users/:id
router.get("/users/:id", adminAuth, async (req: Request, res: Response) => {
  try {
    const { rows } = await query(
      `SELECT id, full_name, bhxh_code, cccd, phone, email, account_type, status, registered_at,
              province, ward, street, gender, ethnicity, birth_date, payment_method,
              bank_name, bank_bin, bank_account_name, bank_account_number,
              registration_location, receiving_agency, tax_code,
              representative_name, representative_position, representative_phone, representative_email
       FROM users WHERE id = $1`,
      [parseInt(String(req.params.id), 10)]
    );
    if (rows.length === 0) return res.status(404).json(errorResponse("Không tìm thấy người dùng", "NOT_FOUND"));
    res.json(successResponse(rows[0]));
  } catch (err) {
    res.status(500).json(errorResponse((err as Error).message, "INTERNAL_ERROR"));
  }
});

// GET /api/admin/users/:id/photo/:field
router.get("/users/:id/photo/:field", adminAuth, async (req: Request, res: Response) => {
  try {
    const allowed = new Set(["photo", "cccd_front", "cccd_back"]);
    const field = String(req.params.field);
    const userId = String(req.params.id);
    if (!allowed.has(field)) return res.status(400).json(errorResponse("Invalid field", "INVALID_FIELD"));
    const columnData = field + "_data";
    const columnPath = field + "_path";
    const { rows } = await query(
      `SELECT ${columnData} as data, ${columnPath} as path FROM users WHERE id = $1`,
      [parseInt(userId, 10)]
    );
    if (rows.length === 0) return res.status(404).json(errorResponse("Không tìm thấy ảnh", "NOT_FOUND"));

    // Ưu tiên file trên disk (P1.5) nếu có; fallback về base64 cũ.
    if (rows[0].path) {
      const persisted = await readPersistedImage(rows[0].path);
      if (persisted) {
        res.setHeader("Content-Type", persisted.mime);
        res.setHeader("Cache-Control", "private, max-age=300");
        return res.send(persisted.buffer);
      }
    }

    if (!rows[0].data) return res.status(404).json(errorResponse("Không tìm thấy ảnh", "NOT_FOUND"));
    const match = /^data:(image\/(jpeg|jpg|png|webp));base64,(.+)$/i.exec(rows[0].data);
    if (!match) return res.status(404).json(errorResponse("Định dạng ảnh không hợp lệ", "INVALID_IMAGE"));
    const mime = match[1];
    const buffer = Buffer.from(match[2], "base64");
    res.setHeader("Content-Type", mime);
    res.setHeader("Cache-Control", "private, max-age=300");
    res.send(buffer);
  } catch (err) {
    res.status(500).json(errorResponse((err as Error).message, "INTERNAL_ERROR"));
  }
});

// PUT /api/admin/users/:id/status
router.put("/users/:id/status", adminAuth, async (req: Request, res: Response) => {
  try {
    const status = String(req.body.status || "").trim();
    const userId = String(req.params.id);
    const allowed = ["approved", "pending", "rejected"];
    if (!allowed.includes(status)) {
      return res.status(400).json(errorResponse("Trạng thái không hợp lệ. Chỉ chấp nhận: " + allowed.join(", "), "INVALID_STATUS"));
    }
    const result = await query(
      "UPDATE users SET status = $1 WHERE id = $2 RETURNING *",
      [status, parseInt(userId, 10)]
    );
    if (result.rows.length === 0) return res.status(404).json(errorResponse("Không tìm thấy người dùng", "NOT_FOUND"));
    void logAudit({
      adminId: req.admin?.id,
      adminUsername: req.admin?.username,
      action: "user.status_change",
      targetType: "user",
      targetId: userId,
      details: { status },
      ip: req.ip,
    });
    res.json(successResponse(result.rows[0], "Cập nhật trạng thái thành công"));
  } catch (err) {
    res.status(500).json(errorResponse((err as Error).message, "INTERNAL_ERROR"));
  }
});

// GET /api/admin/stats
router.get("/stats", adminAuth, async (_req: Request, res: Response) => {
  try {
    const { rows } = await query(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) as approved,
              SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) as pending,
              SUM(CASE WHEN status='rejected' THEN 1 ELSE 0 END) as rejected,
              SUM(CASE WHEN account_type='individual' THEN 1 ELSE 0 END) as individual,
              SUM(CASE WHEN account_type='organization' THEN 1 ELSE 0 END) as org
       FROM users`
    );
    res.json(successResponse(rows[0]));
  } catch (err) {
    res.status(500).json(errorResponse((err as Error).message, "INTERNAL_ERROR"));
  }
});

// GET /api/admin/reports
router.get("/reports", adminAuth, async (req: Request, res: Response) => {
  const days = Math.min(365, Math.max(7, parseInt(String(req.query.days || "30"), 10) || 30));
  try {
    const summaryRes = await query(
      `SELECT
         COUNT(*)::int as total,
         SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END)::int as approved,
         SUM(CASE WHEN status='pending'  THEN 1 ELSE 0 END)::int as pending,
         SUM(CASE WHEN status='rejected' THEN 1 ELSE 0 END)::int as rejected,
         SUM(CASE WHEN account_type='individual'  THEN 1 ELSE 0 END)::int as individual,
         SUM(CASE WHEN account_type='organization' THEN 1 ELSE 0 END)::int as org,
         SUM(CASE WHEN payment_method='cash' THEN 1 ELSE 0 END)::int as payment_cash,
         SUM(CASE WHEN payment_method='transfer' OR payment_method='bank' THEN 1 ELSE 0 END)::int as payment_transfer,
         SUM(CASE WHEN qr_enabled = TRUE THEN 1 ELSE 0 END)::int as qr_active
       FROM users`
    );

    const byProvinceRes = await query(
      `SELECT COALESCE(province, 'UNKNOWN') as code, COUNT(*)::int as count
       FROM users WHERE province IS NOT NULL AND province <> ''
       GROUP BY province ORDER BY count DESC LIMIT 20`
    );

    const byDayRes = await query(
      `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day,
              COUNT(*)::int as total,
              SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END)::int as approved,
              SUM(CASE WHEN status='rejected' THEN 1 ELSE 0 END)::int as rejected,
              SUM(CASE WHEN status='pending'  THEN 1 ELSE 0 END)::int as pending
       FROM users
       WHERE created_at >= NOW() - ($1::integer || ' days')::INTERVAL
       GROUP BY day ORDER BY day ASC`,
      [String(days)]
    );

    res.json(successResponse({
      summary: summaryRes.rows[0] || {},
      byProvince: byProvinceRes.rows,
      byDay: byDayRes.rows,
      rangeDays: days,
    }));
  } catch (err) {
    res.status(500).json(errorResponse((err as Error).message, "INTERNAL_ERROR"));
  }
});

// GET /api/admin/dashboard
router.get("/dashboard", adminAuth, async (_req: Request, res: Response) => {
  try {
    const statsRes = await query(`
      SELECT 
        COUNT(*)::int as total_users,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END)::int as active_users,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END)::int as pending_approvals,
        SUM(CASE WHEN DATE(created_at) = CURRENT_DATE THEN 1 ELSE 0 END)::int as today_registrations,
        SUM(CASE WHEN status IN ('approved','rejected') THEN 1 ELSE 0 END)::int as processed_submissions
      FROM users
    `);

    const recentRes = await query(`
      SELECT 
        TO_CHAR(created_at, 'HH24:MI') as time,
        full_name as name,
        account_type,
        status
      FROM users 
      ORDER BY created_at DESC 
      LIMIT 7
    `);

    const monthlyRes = await query(`
      SELECT 
        TO_CHAR(date_trunc('month', created_at), 'TMmon') as month,
        COUNT(*)::int as count
      FROM users 
      WHERE created_at >= NOW() - INTERVAL '6 months'
      GROUP BY date_trunc('month', created_at)
      ORDER BY date_trunc('month', created_at) ASC
    `);

    const stats = statsRes.rows[0] || {};
    const recentActivity = recentRes.rows.map((r: { time: string; full_name: string; account_type: string; status: string }) => {
      let text = "";
      let type = "info";
      
      if (r.status === 'approved') {
        text = `${r.full_name} đăng ký tài khoản thành công`;
        type = "success";
      } else if (r.status === 'pending') {
        text = `${r.full_name} cần xác thực hồ sơ`;
        type = "warning";
      } else if (r.status === 'rejected') {
        text = `${r.full_name} bị từ chối hồ sơ`;
        type = "error";
      } else {
        text = `${r.full_name} gửi hồ sơ kê khai`;
      }
      
      return { time: r.time, text, type };
    });

    res.json(successResponse({
      stats: {
        totalUsers: stats.total_users || 0,
        activeUsers: stats.active_users || 0,
        pendingApprovals: stats.pending_approvals || 0,
        todayRegistrations: stats.today_registrations || 0,
        totalSubmissions: stats.total_users || 0,
        processedSubmissions: stats.processed_submissions || 0,
      },
      recentActivity,
      registrationsByMonth: monthlyRes.rows.map((r: { month: string; count: number }) => ({
        month: r.month,
        count: r.count
      })),
    }));
  } catch (err) {
    res.status(500).json(errorResponse((err as Error).message, "INTERNAL_ERROR"));
  }
});

// ===== QR Settings API =====

// GET /api/admin/user-qr/:userId
router.get("/user-qr/:userId", adminAuth, async (req: Request, res: Response) => {
  try {
    const userId = String(req.params.userId);
    const { rows } = await query(
      "SELECT * FROM user_qr_settings WHERE user_id = $1",
      [parseInt(userId, 10)]
    );
    if (rows.length === 0) {
      res.json(successResponse({
        user_id: parseInt(userId, 10),
        qr_enabled: false, qr_amount: "", qr_content: "", qr_bank_bin: "",
        qr_bank_name: "", qr_account: "", qr_holder: "",
        qr_payment_type: "bhxh", qr_period: "",
      }));
    } else {
      res.json(successResponse(rows[0]));
    }
  } catch (err) {
    res.status(500).json(errorResponse((err as Error).message, "INTERNAL_ERROR"));
  }
});

// POST /api/admin/user-qr/:userId
router.post("/user-qr/:userId", adminAuth, async (req: Request, res: Response) => {
  const {
    qr_enabled, qr_amount, qr_content, qr_bank_bin, qr_bank_name,
    qr_account, qr_holder, qr_payment_type, qr_period,
  } = req.body;
  const userId = parseInt(String(req.params.userId), 10);
  const now = new Date().toISOString().replace("T", " ").substring(0, 19);
  try {
    const { rows } = await query("SELECT * FROM user_qr_settings WHERE user_id = $1", [userId]);
    if (rows.length === 0) {
      await query(
        `INSERT INTO user_qr_settings (user_id, qr_enabled, qr_amount, qr_content, qr_bank_bin, qr_bank_name, qr_account, qr_holder, qr_payment_type, qr_period, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)`,
        [userId, qr_enabled || false, qr_amount || "", qr_content || "",
          qr_bank_bin || "", qr_bank_name || "", qr_account || "",
          qr_holder || "", qr_payment_type || "bhxh", qr_period || "", now]
      );
    } else {
      await query(
        `UPDATE user_qr_settings SET qr_enabled=$2, qr_amount=$3, qr_content=$4, qr_bank_bin=$5, qr_bank_name=$6, qr_account=$7, qr_holder=$8, qr_payment_type=$9, qr_period=$10, updated_at=$11 WHERE user_id=$1`,
        [userId, qr_enabled || false, qr_amount || "", qr_content || "",
          qr_bank_bin || "", qr_bank_name || "", qr_account || "",
          qr_holder || "", qr_payment_type || "bhxh", qr_period || "", now]
      );
    }
    res.json(successResponse(null, "Đã cập nhật cài đặt QR cho người dùng"));
  } catch (err) {
    res.status(500).json(errorResponse((err as Error).message, "INTERNAL_ERROR"));
  }
});

// PUT /api/admin/user-qr/:userId/toggle
router.put("/user-qr/:userId/toggle", adminAuth, async (req: Request, res: Response) => {
  const userId = parseInt(String(req.params.userId), 10);
  const { enabled } = req.body;
  const now = new Date().toISOString().replace("T", " ").substring(0, 19);
  try {
    const { rows } = await query("SELECT * FROM user_qr_settings WHERE user_id = $1", [userId]);
    if (rows.length === 0) {
      await query(
        `INSERT INTO user_qr_settings (user_id, qr_enabled, created_at, updated_at) VALUES ($1, $2, $3, $3)`,
        [userId, enabled, now]
      );
    } else {
      await query(
        "UPDATE user_qr_settings SET qr_enabled = $2, updated_at = $3 WHERE user_id = $1",
        [userId, enabled, now]
      );
    }
    res.json(successResponse({ qr_enabled: enabled }));
  } catch (err) {
    res.status(500).json(errorResponse((err as Error).message, "INTERNAL_ERROR"));
  }
});

// CSV escape helper (RFC 4180): quote field if it contains comma/newline/quote.
function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// GET /api/admin/users/export - Xuất CSV danh sách người dùng (filtered giống /users).
router.get("/users/export", adminAuth, async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string;
    const accountType = req.query.accountType as string;
    const search = (req.query.search as string || "").trim();
    const where: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (status && ["pending", "approved", "rejected"].includes(status)) {
      where.push(`status = $${i++}`);
      params.push(status);
    }
    if (accountType && ["individual", "organization"].includes(accountType)) {
      where.push(`account_type = $${i++}`);
      params.push(accountType);
    }
    if (search) {
      const sanitized = search.replace(/[\\%_]/g, (ch) => "\\" + ch);
      where.push(
        `(full_name ILIKE $${i} OR bhxh_code ILIKE $${i} OR cccd ILIKE $${i} OR phone ILIKE $${i})`
      );
      params.push(`%${sanitized}%`);
      i++;
    }
    const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";
    const { rows } = await query(
      `SELECT id, full_name, bhxh_code, cccd, phone, email, account_type, status,
              province, ward, street, gender, birth_date,
              bank_name, bank_bin, bank_account_number, bank_account_name,
              tax_code, receiving_agency, registered_at, created_at
       FROM users ${whereSql}
       ORDER BY id DESC
       LIMIT 50000`,
      params
    );

    const headers = [
      "id", "full_name", "bhxh_code", "cccd", "phone", "email",
      "account_type", "status", "province", "ward", "street",
      "gender", "birth_date",
      "bank_name", "bank_bin", "bank_account_number", "bank_account_name",
      "tax_code", "receiving_agency", "registered_at", "created_at",
    ];
    const lines = [headers.join(",")];
    for (const r of rows) {
      lines.push(headers.map((h) => csvEscape((r as Record<string, unknown>)[h])).join(","));
    }
    const csv = "\ufeff" + lines.join("\r\n"); // BOM để Excel nhận UTF-8
    const filename = `users-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    res.status(500).json(errorResponse((err as Error).message, "INTERNAL_ERROR"));
  }
});

// GET /api/admin/qr-history - List QR generation history
router.get("/qr-history", adminAuth, async (req: Request, res: Response) => {
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || "50"), 10) || 50));
  const search = (req.query.search as string || "").trim();
  try {
    let whereClause = "";
    const params: unknown[] = [];
    let idx = 1;
    if (search) {
      const sanitized = search.replace(/[\\%_]/g, (ch) => "\\" + ch);
      whereClause = ` WHERE (content ILIKE $${idx} OR bhxh_code ILIKE $${idx} OR account_name ILIKE $${idx})`;
      params.push(`%${sanitized}%`);
      idx++;
    }
    const { rows } = await query(
      `SELECT id, admin_id, bank_bin, bank_name, account_number, account_name,
              amount, content, bhxh_code, created_at
       FROM qr_history${whereClause}
       ORDER BY created_at DESC LIMIT $${idx}`,
      [...params, limit]
    );
    res.json(successResponse(rows));
  } catch (err) {
    res.status(500).json(errorResponse((err as Error).message, "INTERNAL_ERROR"));
  }
});

// POST /api/admin/qr-history - Save QR generation to history
router.post("/qr-history", adminAuth, async (req: Request, res: Response) => {
  const { bankBin, bankName, accountNumber, accountName, amount, content, bhxhCode, qrData } = req.body;
  try {
    const { rows } = await query(
      `INSERT INTO qr_history (admin_id, bank_bin, bank_name, account_number, account_name, amount, content, bhxh_code, qr_data, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()) RETURNING id`,
      [
        req.admin?.id || null,
        bankBin || "", bankName || "", accountNumber || "",
        accountName || "", amount || "", content || "",
        bhxhCode || "", qrData || "",
      ]
    );
    res.status(201).json(successResponse({ id: rows[0].id }, "Đã lưu lịch sử QR"));
  } catch (err) {
    res.status(500).json(errorResponse((err as Error).message, "INTERNAL_ERROR"));
  }
});

// ===== Agencies CRUD =====

// GET /api/admin/agencies - List all user-created agencies
router.get("/agencies", adminAuth, async (_req: Request, res: Response) => {
  try {
    const { rows } = await query(
      "SELECT id, code, name, parent_id, level, address, phone, email, created_at FROM agencies ORDER BY created_at DESC"
    );
    res.json(successResponse(rows));
  } catch (err) {
    res.status(500).json(errorResponse((err as Error).message, "INTERNAL_ERROR"));
  }
});

// POST /api/admin/agencies - Create a new agency
router.post("/agencies", adminAuth, async (req: Request, res: Response) => {
  const { code, name, parentId, level, address, phone, email } = req.body;
  if (!code || !name) {
    return res.status(400).json(errorResponse("Mã và tên đơn vị không được để trống", "VALIDATION_ERROR"));
  }
  const id = "AG_" + code + "_" + Date.now().toString(36);
  try {
    await query(
      `INSERT INTO agencies (id, code, name, parent_id, level, address, phone, email, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
      [id, code, name, parentId || null, level || 4, address || "", phone || "", email || ""]
    );
    void logAudit({
      adminId: req.admin?.id,
      adminUsername: req.admin?.username,
      action: "agency.create",
      targetType: "agency",
      targetId: id,
      details: { code, name },
      ip: req.ip,
    });
    res.status(201).json(successResponse({ id, code, name, parent_id: parentId || null, level: level || 4 }));
  } catch (err) {
    res.status(500).json(errorResponse((err as Error).message, "INTERNAL_ERROR"));
  }
});

// DELETE /api/admin/agencies/:id
router.delete("/agencies/:id", adminAuth, async (req: Request, res: Response) => {
  const id = String(req.params.id);
  try {
    // Delete children first, then the agency itself
    await query("DELETE FROM agencies WHERE id = $1 OR parent_id = $1", [id]);
    void logAudit({
      adminId: req.admin?.id,
      adminUsername: req.admin?.username,
      action: "agency.delete",
      targetType: "agency",
      targetId: id,
      ip: req.ip,
    });
    res.json(successResponse(null, "Đã xóa đơn vị thành công"));
  } catch (err) {
    res.status(500).json(errorResponse((err as Error).message, "INTERNAL_ERROR"));
  }
});

export { router as adminRoutes };
