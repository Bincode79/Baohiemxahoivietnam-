import { Router } from "express";
import { checkConnection, query } from "../db";
import { successResponse } from "../types/response";
import { PROVINCES } from "../data/provinces";
import { AGENCIES } from "../data/agencies";
import { getWardsByProvince } from "../data/wards";
import type { Request, Response } from "express";

const router = Router();

router.get("/health", async (_req: Request, res: Response) => {
  const dbStatus = await checkConnection();
  res.json({
    success: true,
    data: {
      status: "ok",
      timestamp: new Date().toISOString(),
      database: {
        healthy: dbStatus.healthy,
        latencyMs: dbStatus.latencyMs,
        pool: dbStatus.poolStats,
      },
    },
  });
});

// POST /api/csp-report - CSP violation report endpoint. Khi CSP_REPORT_ONLY=true,
// browser gửi report về đây. Chỉ log cảnh báo, không cần response body.
router.post("/csp-report", (req: Request, res: Response) => {
  console.warn("[CSP-VIOLATION]", JSON.stringify(req.body).slice(0, 500));
  res.status(204).end();
});

router.get("/provinces", (_req: Request, res: Response) => {
  res.json(PROVINCES);
});

router.get("/provinces/:code/wards", (req: Request, res: Response) => {
  const wards = getWardsByProvince(String(req.params.code));
  res.json(wards);
});

router.get("/wards", (req: Request, res: Response) => {
  const provinceCode = (req.query.provinceCode as string || "").trim();
  const wards = getWardsByProvince(provinceCode);
  res.json(wards);
});

router.get("/agencies", async (req: Request, res: Response) => {
  const parentId = req.query.parentId as string | undefined;
  try {
    const { rows: dbAgencies } = await query(
      parentId
        ? "SELECT id, code, name, parent_id, level, address, phone, email FROM agencies WHERE parent_id = $1 ORDER BY name ASC"
        : "SELECT id, code, name, parent_id, level, address, phone, email FROM agencies WHERE parent_id IS NULL ORDER BY name ASC",
      parentId ? [parentId] : []
    );
    const staticFiltered = parentId
      ? AGENCIES.filter((a) => a.parentId === parentId)
      : AGENCIES.filter((a) => a.parentId === null);
    const combined = [
      ...staticFiltered.map((a) => ({
        id: a.id, code: a.code, name: a.name, parentId: a.parentId,
        level: a.hasChild ? 1 : 2, address: "", phone: "", email: "", isStatic: true,
      })),
      ...dbAgencies.map((a: Record<string, unknown>) => ({
        id: String(a.id), code: String(a.code), name: String(a.name), parentId: a.parent_id as string | null,
        level: a.level as number, address: String(a.address || ""), phone: String(a.phone || ""), email: String(a.email || ""), isStatic: false,
      })),
    ];
    res.json(successResponse(combined));
  } catch {
    if (parentId === undefined || parentId === null) {
      res.json(successResponse(AGENCIES.filter((a) => a.parentId === null)));
    } else {
      res.json(successResponse(AGENCIES.filter((a) => a.parentId === parentId)));
    }
  }
});

router.get("/agencies/tree", async (_req: Request, res: Response) => {
  try {
    const { rows: dbAgencies } = await query(
      "SELECT id, code, name, parent_id, level, address, phone, email FROM agencies ORDER BY name ASC"
    );
    type AgencyItem = { id: string; code: string; name: string; parentId: string | null; level: number; address: string; phone: string; email: string; isStatic: boolean; };
    const allItems: AgencyItem[] = [
      ...AGENCIES.map((a) => ({
        id: a.id, code: a.code, name: a.name, parentId: a.parentId,
        level: a.hasChild ? 1 : 2, address: "", phone: "", email: "", isStatic: true,
      })),
      ...dbAgencies.map((a: Record<string, unknown>) => ({
        id: String(a.id), code: String(a.code), name: String(a.name), parentId: a.parent_id as string | null,
        level: a.level as number, address: String(a.address || ""), phone: String(a.phone || ""), email: String(a.email || ""), isStatic: false,
      })),
    ];
    const map = new Map<string, AgencyItem & { children: AgencyItem[] }>();
    const roots: (AgencyItem & { children: AgencyItem[] })[] = [];
    allItems.forEach((a) => map.set(a.id, { ...a, children: [] }));
    allItems.forEach((a) => {
      const node = map.get(a.id)!;
      if (a.parentId && map.has(a.parentId)) {
        map.get(a.parentId)!.children.push(node);
      } else if (!a.parentId) {
        roots.push(node);
      }
    });
    res.json(successResponse(roots));
  } catch {
    res.json(successResponse(AGENCIES.map((a) => ({
      id: a.id, code: a.code, name: a.name, parentId: a.parentId,
      level: a.hasChild ? 1 : 2, address: "", phone: "", email: "",
      isStatic: true, children: [],
    }))));
  }
});

export { router as publicRoutes };
