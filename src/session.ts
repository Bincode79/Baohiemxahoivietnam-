import { randomToken } from "./crypto";

// Abstract token store. Allows the session store to be swapped between
// in-memory (single instance, dev) and Redis (multi-instance, prod).
export interface AdminSession {
  id: number;
  username: string;
  role: string;
}

export interface UserSession {
  role: string;
  userId: number;
}

export interface TokenStore {
  setAdmin(token: string, payload: AdminSession, ttlSec?: number): Promise<void>;
  getAdmin(token: string): Promise<AdminSession | undefined>;
  deleteAdmin(token: string): Promise<void>;
  setUser(token: string, payload: UserSession, ttlSec?: number): Promise<void>;
  getUser(token: string): Promise<UserSession | undefined>;
  deleteUser(token: string): Promise<void>;
  size(): Promise<number>;
  shutdown(): Promise<void>;
}

const DEFAULT_TTL_SEC = 12 * 60 * 60; // 12 hours

class MemoryTokenStore implements TokenStore {
  private admins = new Map<string, AdminSession>();
  private users = new Map<string, UserSession>();
  private timers = new Map<string, NodeJS.Timeout>();

  private scheduleDelete(key: string, ttlSec: number, kind: "admin" | "user") {
    const existing = this.timers.get(key);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => {
      if (kind === "admin") this.admins.delete(key);
      else this.users.delete(key);
      this.timers.delete(key);
    }, ttlSec * 1000);
    // unref để không giữ event loop
    if (typeof t.unref === "function") t.unref();
    this.timers.set(key, t);
  }

  async setAdmin(token: string, payload: AdminSession, ttlSec: number = DEFAULT_TTL_SEC) {
    this.admins.set(token, payload);
    this.scheduleDelete(token, ttlSec, "admin");
  }
  async getAdmin(token: string) {
    return this.admins.get(token);
  }
  async deleteAdmin(token: string) {
    this.admins.delete(token);
    const t = this.timers.get(token);
    if (t) {
      clearTimeout(t);
      this.timers.delete(token);
    }
  }
  async setUser(token: string, payload: UserSession, ttlSec: number = DEFAULT_TTL_SEC) {
    this.users.set(token, payload);
    this.scheduleDelete(token, ttlSec, "user");
  }
  async getUser(token: string) {
    return this.users.get(token);
  }
  async deleteUser(token: string) {
    this.users.delete(token);
    const t = this.timers.get(token);
    if (t) {
      clearTimeout(t);
      this.timers.delete(token);
    }
  }
  async size() {
    return this.admins.size + this.users.size;
  }
  async shutdown() {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }
}

let activeStore: TokenStore | null = null;

export function getTokenStore(): TokenStore {
  if (!activeStore) activeStore = new MemoryTokenStore();
  return activeStore;
}

/**
 * Đổi sang Redis store nếu REDIS_URL được set. Hàm async vì Redis client
 * cần khởi tạo kết nối. Nếu không có REDIS_URL, dùng MemoryTokenStore và
 * in cảnh báo khi NODE_ENV=production.
 *
 * Khi Redis được bật, ta dùng @keyv/redis hoặc ioredis nếu có sẵn.
 * Dự án này không có Redis client trong dependencies để giữ bundle nhỏ;
 * ở đây ta cung cấp stub: nếu `ioredis` được install thì dùng, ngược lại
 * fallback in-memory + cảnh báo.
 */
export async function initTokenStore(): Promise<TokenStore> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "[SECURITY] REDIS_URL is not set in production. Using in-memory token store: NOT horizontally scalable, all sessions lost on restart."
      );
    }
    activeStore = new MemoryTokenStore();
    return activeStore;
  }

  // Cố gắng dùng ioredis nếu đã được cài (lazy require)
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const IORedis = require("ioredis");
    const client = new IORedis(redisUrl);
    const keyPrefix = "bhxh:tok:";
    const ttl = DEFAULT_TTL_SEC;

    const redisStore: TokenStore = {
      async setAdmin(token, payload) {
        await client.set(keyPrefix + "a:" + token, JSON.stringify(payload), "EX", ttl);
      },
      async getAdmin(token) {
        const v = await client.get(keyPrefix + "a:" + token);
        return v ? (JSON.parse(v) as AdminSession) : undefined;
      },
      async deleteAdmin(token) {
        await client.del(keyPrefix + "a:" + token);
      },
      async setUser(token, payload) {
        await client.set(keyPrefix + "u:" + token, JSON.stringify(payload), "EX", ttl);
      },
      async getUser(token) {
        const v = await client.get(keyPrefix + "u:" + token);
        return v ? (JSON.parse(v) as UserSession) : undefined;
      },
      async deleteUser(token) {
        await client.del(keyPrefix + "u:" + token);
      },
      async size() {
        const keys = await client.keys(keyPrefix + "*");
        return keys.length;
      },
      async shutdown() {
        try {
          await client.quit();
        } catch {
          /* ignore */
        }
      },
    };
    activeStore = redisStore;
    console.log("[AUTH] Token store backed by Redis");
    return activeStore;
  } catch (err) {
    console.warn(
      "[AUTH] REDIS_URL is set but ioredis is not installed. Falling back to in-memory store."
    );
    activeStore = new MemoryTokenStore();
    return activeStore;
  }
}

export { randomToken };
