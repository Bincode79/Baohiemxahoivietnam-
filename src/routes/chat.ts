import { Router } from "express";
import { query } from "../db";
import { successResponse, errorResponse } from "../types/response";
import { adminAuth } from "./auth";
import type { Request, Response } from "express";

const router = Router();

// GET /api/chat/conversations - FIXED N+1 query
router.get("/conversations", adminAuth, async (_req: Request, res: Response) => {
  try {
    // Single query with LEFT JOIN to get all conversations with their messages
    const { rows: conversations } = await query(`
      SELECT 
        c.id,
        c.user_name,
        c.id_card,
        c.phone,
        c.status,
        c.unread,
        c.created_at,
        COALESCE(
          json_agg(
            json_build_object(
              'from', m.sender,
              'text', m.text,
              'time', m.time
            ) ORDER BY m.id
          ) FILTER (WHERE m.id IS NOT NULL),
          '[]'
        ) as messages
      FROM chat_conversations c
      LEFT JOIN chat_messages m ON c.id = m.conversation_id
      GROUP BY c.id
      ORDER BY c.id DESC
    `);

    res.json(successResponse(conversations));
  } catch (err) {
    res.status(500).json(errorResponse((err as Error).message, "INTERNAL_ERROR"));
  }
});

// POST /api/chat/messages
router.post("/messages", async (req: Request, res: Response) => {
  const { userName, idCard, phone, text } = req.body;
  if (!text) return res.status(400).json(errorResponse("Nội dung tin nhắn không được để trống", "VALIDATION_ERROR"));

  const noteText = String(text).slice(0, 1000);
  const idCardTrim = (idCard || "").trim();
  const userNameTrim = (userName || "").trim();
  const phoneTrim = (phone || "").trim();
  
  try {
    let conv: { id: number; [key: string]: unknown } | undefined;
    
    if (idCardTrim) {
      const { rows } = await query(
        "SELECT * FROM chat_conversations WHERE id_card = $1 AND status = 'active' LIMIT 1",
        [idCardTrim]
      );
      if (rows.length > 0) {
        conv = rows[0];
        const updates: string[] = [];
        const vals: unknown[] = [];
        let idx = 1;
        if (phoneTrim) { updates.push(`phone = $${idx++}`); vals.push(phoneTrim); }
        if (idCardTrim) { updates.push(`id_card = $${idx++}`); vals.push(idCardTrim); }
        if (updates.length > 0) {
          vals.push(conv!.id);
          await query(`UPDATE chat_conversations SET ${updates.join(", ")} WHERE id = $${idx}`, vals);
        }
      }
    }
    
    if (!conv) {
      if (!idCardTrim && !userNameTrim) {
        return res.status(400).json(errorResponse("Cần cung cấp số CCCD hoặc họ tên để bắt đầu hội thoại", "VALIDATION_ERROR"));
      }
      const now = new Date().toISOString().replace("T", " ").substring(0, 19);
      const result = await query(
        "INSERT INTO chat_conversations (user_name, id_card, phone, status, unread, created_at) VALUES ($1, $2, $3, 'active', 0, $4) RETURNING *",
        [userNameTrim || "Khách", idCardTrim, phoneTrim, now]
      );
      conv = result.rows[0];
    }
    
    // At this point conv is guaranteed to be defined
    const convId = conv!.id;
    
    const now = new Date();
    const time = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
    await query(
      "INSERT INTO chat_messages (conversation_id, sender, text, time) VALUES ($1, 'user', $2, $3)",
      [convId, noteText, time]
    );
    await query("UPDATE chat_conversations SET unread = unread + 1 WHERE id = $1", [convId]);

    // Fetch updated messages
    const { rows: msgs } = await query(
      "SELECT sender as from_user, text, time FROM chat_messages WHERE conversation_id = $1 ORDER BY id",
      [convId]
    );
    if (conv) {
      conv.messages = msgs.map((m: { from_user: string; text: string; time: string }) => ({ from: m.from_user, text: m.text, time: m.time }));
    }
    res.status(201).json(successResponse({ conversation: conv! }));
  } catch (err) {
    res.status(500).json(errorResponse((err as Error).message, "INTERNAL_ERROR"));
  }
});

// POST /api/chat/admin/reply
router.post("/admin/reply", adminAuth, async (req: Request, res: Response) => {
  const { conversationId, text } = req.body;
  if (!text) return res.status(400).json(errorResponse("Nội dung trả lời không được để trống", "VALIDATION_ERROR"));
  
  const replyText = String(text).slice(0, 1000);
  try {
    const { rows } = await query("SELECT * FROM chat_conversations WHERE id = $1", [parseInt(String(conversationId), 10)]);
    if (rows.length === 0) return res.status(404).json(errorResponse("Không tìm thấy hội thoại", "NOT_FOUND"));

    const now = new Date();
    const time = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
    await query(
      "INSERT INTO chat_messages (conversation_id, sender, text, time) VALUES ($1, 'admin', $2, $3)",
      [conversationId, replyText, time]
    );
    await query("UPDATE chat_conversations SET unread = 0 WHERE id = $1", [conversationId]);

    const { rows: msgs } = await query(
      "SELECT sender as from_user, text, time FROM chat_messages WHERE conversation_id = $1 ORDER BY id",
      [conversationId]
    );
    res.json(successResponse({
      conversation: {
        id: conversationId,
        messages: msgs.map((m: { from_user: string; text: string; time: string }) => ({ from: m.from_user, text: m.text, time: m.time })),
      },
    }));
  } catch (err) {
    res.status(500).json(errorResponse((err as Error).message, "INTERNAL_ERROR"));
  }
});

// PUT /api/chat/conversations/:id/status
router.put("/conversations/:id/status", adminAuth, async (req: Request, res: Response) => {
  try {
    await query(
      "UPDATE chat_conversations SET status = $1 WHERE id = $2",
      [req.body.status || "closed", parseInt(String(req.params.id), 10)]
    );
    res.json(successResponse(null, "Cập nhật trạng thái thành công"));
  } catch (err) {
    res.status(500).json(errorResponse((err as Error).message, "INTERNAL_ERROR"));
  }
});

export { router as chatRoutes };
