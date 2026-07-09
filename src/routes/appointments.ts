import { Router } from "express";
import { query } from "../db";
import { validateAppointmentPayload, normalizePhone } from "../validation";
import { successResponse, errorResponse } from "../types/response";
import { adminAuth } from "./auth";
import { logAudit } from "../audit";
import type { Request, Response } from "express";

const router = Router();

// GET /api/appointments
router.get("/", adminAuth, async (_req: Request, res: Response) => {
  try {
    const { rows } = await query("SELECT * FROM appointments ORDER BY id");
    const pending = rows.filter((r: { status: string }) => r.status === "pending").length;
    const confirmed = rows.filter((r: { status: string }) => r.status === "confirmed").length;
    const cancelled = rows.filter((r: { status: string }) => r.status === "cancelled").length;
    res.json(successResponse({
      appointments: rows,
      stats: { total: rows.length, pending, confirmed, cancelled }
    }));
  } catch (err) {
    res.status(500).json(errorResponse((err as Error).message, "INTERNAL_ERROR"));
  }
});

// POST /api/appointments
router.post("/", async (req: Request, res: Response) => {
  const body = req.body;
  const validation = validateAppointmentPayload(body);
  if (!validation.ok) {
    return res.status(400).json(errorResponse(validation.message, "VALIDATION_ERROR"));
  }
  const now = new Date().toISOString().replace("T", " ").substring(0, 19);
  try {
    // Anti double-booking: same date + same time_slot pending/confirmed = conflict.
    if (body.timeSlot) {
      const conflict = await query(
        `SELECT id FROM appointments
         WHERE date = $1 AND time_slot = $2 AND status IN ('pending','confirmed')
         LIMIT 1`,
        [String(body.date), String(body.timeSlot)]
      );
      if (conflict.rows.length > 0) {
        return res.status(409).json(errorResponse("Khung giờ này đã có người đặt, vui lòng chọn khung giờ khác.", "SLOT_TAKEN"));
      }
    }

    const result = await query(
      `INSERT INTO appointments (full_name, phone, email, bhxh_code, date, time_slot, service, note, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9) RETURNING *`,
      [
        String(body.fullName || "").slice(0, 200),
        normalizePhone(String(body.phone || "")),
        String(body.email || "").slice(0, 200),
        String(body.bhxhCode || "").slice(0, 20),
        String(body.date || "").slice(0, 20),
        String(body.timeSlot || "").slice(0, 50),
        String(body.service || "").slice(0, 50),
        String(body.note || "").slice(0, 1000),
        now,
      ]
    );
    res.status(201).json(successResponse({ appointment: result.rows[0] }, "Yêu cầu đặt lịch đã được ghi nhận!"));
  } catch (err) {
    res.status(500).json(errorResponse((err as Error).message, "INTERNAL_ERROR"));
  }
});

// PUT /api/appointments/:id/status
router.put("/:id/status", adminAuth, async (req: Request, res: Response) => {
  try {
    const result = await query(
      "UPDATE appointments SET status = $1 WHERE id = $2 RETURNING *",
      [req.body.status, parseInt(String(req.params.id), 10)]
    );
    if (result.rows.length === 0) return res.status(404).json(errorResponse("Không tìm thấy lịch hẹn", "NOT_FOUND"));
    void logAudit({
      adminId: req.admin?.id,
      adminUsername: req.admin?.username,
      action: "appointment.status_change",
      targetType: "appointment",
      targetId: String(req.params.id),
      details: { status: req.body.status },
      ip: req.ip,
    });
    res.json(successResponse({ appointment: result.rows[0] }));
  } catch (err) {
    res.status(500).json(errorResponse((err as Error).message, "INTERNAL_ERROR"));
  }
});

export { router as appointmentRoutes };
