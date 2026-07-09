import { query } from "./db";

export interface AuditEntry {
  adminId?: number;
  adminUsername?: string;
  action: string;
  targetType: string;
  targetId?: string | number;
  details?: Record<string, unknown>;
  ip?: string;
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    await query(
      `INSERT INTO audit_logs (admin_id, admin_username, action, target_type, target_id, details, ip, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        entry.adminId || null,
        entry.adminUsername || null,
        entry.action,
        entry.targetType,
        entry.targetId != null ? String(entry.targetId) : null,
        entry.details ? JSON.stringify(entry.details) : null,
        entry.ip || null,
      ]
    );
  } catch (err) {
    // Audit log lỗi không được làm crash request chính, chỉ in cảnh báo.
    console.warn("[AUDIT] Failed to write audit log:", (err as Error).message);
  }
}
