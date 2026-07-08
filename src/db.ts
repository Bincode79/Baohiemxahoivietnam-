import { Pool, PoolClient } from "pg";
import { randomBytes } from "crypto";
import { scryptHash } from "./crypto";

function getDbConfig() {
  const connectionString = process.env.DATABASE_URL;
  
  const poolSize = Math.min(20, Math.max(5, parseInt(process.env.DB_POOL_SIZE || "10", 10)));
  
  if (connectionString) {
    return {
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: poolSize,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 30000,
    };
  }

  return {
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5432", 10),
    database: process.env.DB_NAME || "bhxh",
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "",
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
    max: poolSize,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 30000,
  };
}

const pool = new Pool(getDbConfig());

pool.on("error", (err) => {
  console.error("[DB] Unexpected error on idle client", err);
});

export async function query(text: string, params?: unknown[]) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function checkConnection(): Promise<{ healthy: boolean; latencyMs: number; poolStats: { total: number; idle: number; waiting: number } }> {
  const start = Date.now();
  try {
    await pool.query("SELECT 1");
    const latencyMs = Date.now() - start;
    const poolStats = {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount,
    };
    return { healthy: true, latencyMs, poolStats };
  } catch {
    return { healthy: false, latencyMs: Date.now() - start, poolStats: { total: 0, idle: 0, waiting: 0 } };
  }
}

export async function initDb() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      full_name TEXT NOT NULL DEFAULT '',
      bhxh_code TEXT DEFAULT '',
      cccd TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      account_type TEXT DEFAULT 'individual',
      status TEXT DEFAULT 'pending',
      registered_at TEXT DEFAULT '',
      province TEXT DEFAULT '',
      ward TEXT DEFAULT '',
      street TEXT DEFAULT '',
      gender TEXT DEFAULT '',
      ethnicity TEXT DEFAULT '',
      birth_date TEXT DEFAULT '',
      payment_method TEXT DEFAULT 'transfer',
      bank_name TEXT DEFAULT '',
      bank_bin TEXT DEFAULT '',
      bank_account_name TEXT DEFAULT '',
      bank_account_number TEXT DEFAULT '',
      registration_location TEXT DEFAULT 'portal',
      receiving_agency TEXT DEFAULT '',
      password_hash TEXT DEFAULT '',
      photo_data TEXT DEFAULT '',
      cccd_front_data TEXT DEFAULT '',
      cccd_back_data TEXT DEFAULT '',
      tax_code TEXT DEFAULT '',
      representative_name TEXT DEFAULT '',
      representative_position TEXT DEFAULT '',
      representative_phone TEXT DEFAULT '',
      representative_email TEXT DEFAULT ''
    );

    ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_data TEXT DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS cccd_front_data TEXT DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS cccd_back_data TEXT DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS tax_code TEXT DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS representative_name TEXT DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS representative_position TEXT DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS representative_phone TEXT DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS representative_email TEXT DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS ward TEXT DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS street TEXT DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS gender TEXT DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS ethnicity TEXT DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date TEXT DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'transfer';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_name TEXT DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_bin TEXT DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_account_name TEXT DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_account_number TEXT DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS receiving_agency TEXT DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS registered_at TEXT DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS province TEXT DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
    ALTER TABLE users ADD COLUMN IF NOT EXISTS qr_enabled BOOLEAN DEFAULT FALSE;

    -- P1.5: Lưu path file ảnh trên disk (ưu tiên) thay vì base64 thuần để giảm
    -- dung lượng DB ~33%. base64 cũ vẫn giữ để tương thích ngược.
    ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_path TEXT DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS cccd_front_path TEXT DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS cccd_back_path TEXT DEFAULT '';
    -- P3.23: Cột encrypted chỉ được populate khi ENCRYPT_SENSITIVE=true.
    -- Lưu ciphertext (bytea) để search bằng deterministic hash.
    -- Cột cũ cccd/phone vẫn giữ để tương thích ngược.
    ALTER TABLE users ADD COLUMN IF NOT EXISTS cccd_encrypted BYTEA DEFAULT NULL;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_encrypted BYTEA DEFAULT NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS users_bhxh_code_unique ON users (bhxh_code) WHERE bhxh_code <> '';
    CREATE UNIQUE INDEX IF NOT EXISTS users_cccd_unique ON users (cccd) WHERE cccd <> '';
    CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique ON users (phone) WHERE phone <> '';
    CREATE UNIQUE INDEX IF NOT EXISTS users_tax_code_unique ON users (tax_code) WHERE tax_code <> '';
    CREATE INDEX IF NOT EXISTS users_phone_idx ON users (phone);
    CREATE INDEX IF NOT EXISTS users_email_idx ON users (email);
    CREATE INDEX IF NOT EXISTS users_tax_code_idx ON users (tax_code);

    CREATE TABLE IF NOT EXISTS appointments (
      id SERIAL PRIMARY KEY,
      full_name TEXT NOT NULL DEFAULT '',
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      bhxh_code TEXT DEFAULT '',
      date TEXT DEFAULT '',
      time_slot TEXT DEFAULT '',
      service TEXT DEFAULT '',
      note TEXT DEFAULT '',
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS chat_conversations (
      id SERIAL PRIMARY KEY,
      user_name TEXT DEFAULT 'Khách',
      id_card TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      status TEXT DEFAULT 'active',
      unread INTEGER DEFAULT 0,
      created_at TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id SERIAL PRIMARY KEY,
      conversation_id INTEGER REFERENCES chat_conversations(id) ON DELETE CASCADE,
      sender TEXT DEFAULT 'user',
      text TEXT DEFAULT '',
      time TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS agencies (
      id VARCHAR(50) PRIMARY KEY,
      code VARCHAR(50) NOT NULL,
      name VARCHAR(255) NOT NULL,
      parent_id VARCHAR(50),
      level INTEGER DEFAULT 4,
      address TEXT DEFAULT '',
      phone VARCHAR(20) DEFAULT '',
      email VARCHAR(255) DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS agencies_parent_idx ON agencies (parent_id);

    CREATE TABLE IF NOT EXISTS user_qr_settings (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      qr_enabled BOOLEAN DEFAULT FALSE,
      qr_amount TEXT DEFAULT '',
      qr_content TEXT DEFAULT '',
      qr_bank_bin TEXT DEFAULT '',
      qr_bank_name TEXT DEFAULT '',
      qr_account TEXT DEFAULT '',
      qr_holder TEXT DEFAULT '',
      qr_payment_type TEXT DEFAULT 'bhxh',
      qr_period TEXT DEFAULT '',
      created_at TEXT DEFAULT '',
      updated_at TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS qr_history (
      id SERIAL PRIMARY KEY,
      admin_id INTEGER REFERENCES admins(id) ON DELETE SET NULL,
      bank_bin TEXT DEFAULT '',
      bank_name TEXT DEFAULT '',
      account_number TEXT DEFAULT '',
      account_name TEXT DEFAULT '',
      amount TEXT DEFAULT '',
      content TEXT DEFAULT '',
      bhxh_code TEXT DEFAULT '',
      qr_data TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS qr_history_admin_idx ON qr_history (admin_id);
    CREATE INDEX IF NOT EXISTS qr_history_created_at_idx ON qr_history (created_at DESC);

    CREATE TABLE IF NOT EXISTS admins (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'admin',
      created_at TIMESTAMP DEFAULT NOW()
    );

    -- P3.23: Enable pgcrypto extension để mã hóa trường nhạy cảm (CCCD, SĐT).
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      admin_id INTEGER REFERENCES admins(id) ON DELETE SET NULL,
      admin_username TEXT,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      details JSONB,
      ip TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON audit_logs (action);
    CREATE INDEX IF NOT EXISTS audit_logs_target_idx ON audit_logs (target_type, target_id);
    CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs (created_at DESC);
  `);

  const adminCount = await query("SELECT COUNT(*)::int as cnt FROM admins");
  if (adminCount.rows[0].cnt === 0) {
    const defaultUsername = process.env.ADMIN_USERNAME || "admin";
    const envPassword = process.env.ADMIN_PASSWORD;
    if (envPassword) {
      // Có ADMIN_PASSWORD từ env (khuyến nghị cho production) → dùng luôn
      const adminHash = await scryptHash(envPassword);
      await query(
        "INSERT INTO admins (username, password_hash, role) VALUES ($1, $2, $3)",
        [defaultUsername, adminHash, "admin"]
      );
      console.warn("============================================================");
      console.warn(`[SECURITY] Default admin seeded from ADMIN_USERNAME/ADMIN_PASSWORD env.`);
      console.warn(`[SECURITY] Username: ${defaultUsername}`);
      console.warn("============================================================");
    } else {
      // Không có env password → sinh ngẫu nhiên CHỈ trong dev
      if (process.env.NODE_ENV === "production") {
        throw new Error(
          "ADMIN_PASSWORD must be set in production. Refusing to bootstrap with a random password."
        );
      }
      const defaultPassword = randomBytes(12).toString("base64url");
      const adminHash = await scryptHash(defaultPassword);
      await query(
        "INSERT INTO admins (username, password_hash, role) VALUES ($1, $2, $3)",
        [defaultUsername, adminHash, "admin"]
      );
      console.warn("============================================================");
      console.warn("[SECURITY] Default admin seeded (development mode).");
      console.warn(`[SECURITY] Username: ${defaultUsername}`);
      console.warn(`[SECURITY] Password: ${defaultPassword}`);
      console.warn("[SECURITY] Change this password immediately via /quan-tri");
      console.warn("============================================================");
    }
  }

  const countResult = await query("SELECT COUNT(*)::int as cnt FROM users");
  const userCount = countResult.rows[0].cnt;
  if (userCount === 0) {
    if (process.env.NODE_ENV === "production") {
      console.warn("[DB] Skipping demo user seeding in production");
    } else {
      await seedDemoUsers();
    }
  } else {
    const emptyPwdUsers = await query(
      "SELECT id, bhxh_code FROM users WHERE password_hash IS NULL OR password_hash = ''"
    );
    if (emptyPwdUsers.rows.length > 0 && process.env.NODE_ENV !== "production") {
      const defaultPwd = await scryptHash(randomBytes(12).toString("base64url"));
      for (const user of emptyPwdUsers.rows) {
        await query("UPDATE users SET password_hash = $1 WHERE id = $2", [defaultPwd, user.id]);
      }
      console.warn(
        `[DB] Reset password_hash for ${emptyPwdUsers.rows.length} users with missing hash. Check logs for new passwords.`
      );
    }
  }
}

async function seedDemoUsers() {
  const DEMO_PASSWORD = "Demo@123456";
  const defaultPwd = await scryptHash(DEMO_PASSWORD);
  const seedUsers = [
    ["Nguyễn Văn An", "0123456789", "001099001234", "0912345678", "nguyenvanan@email.com", "individual", "approved", "2026-06-15 08:30:00", "01", "Cầu Giấy", "Số 10 Nguyễn Văn A", "Nam", "Kinh", "1985-08-15", "", "", "", "", defaultPwd],
    ["Trần Thị Bình", "0123456790", "002099001235", "0987654321", "tranthibinh@email.com", "individual", "pending", "2026-07-01 09:15:00", "03", "Quận 1", "Số 20 Lê Lợi", "Nữ", "Kinh", "1990-03-20", "", "", "", "", defaultPwd],
    ["Công ty TNHH Sản xuất ABC", "0123456791", "030099001236", "02412345678", "abc@company.com", "organization", "approved", "2026-06-20 10:00:00", "23", "Thủ Dầu Một", "Số 5 Đại lộ Bình Dương", "", "Kinh", "2000-01-01", "0300123456", "Nguyễn Văn Giám Đốc", "Giám đốc", "0901234567", defaultPwd],
    ["Lê Văn Cường", "0123456792", "004099001237", "0933123456", "levancuong@email.com", "individual", "rejected", "2026-06-25 14:20:00", "05", "Hải Châu", "Số 15 Trần Phú", "Nam", "Kinh", "1988-11-12", "", "", "", "", defaultPwd],
    ["Phạm Thị Dung", "0123456793", "005099001238", "0977456123", "phamthidung@email.com", "individual", "pending", "2026-07-02 11:30:00", "04", "Hồng Bàng", "Số 8 Điện Biên Phủ", "Nữ", "Kinh", "1995-07-04", "", "", "", "", defaultPwd],
    ["Doanh nghiệp Tư nhân XYZ", "0123456794", "060099001239", "0255123456", "xyz@company.com", "organization", "approved", "2026-06-10 08:00:00", "32", "Biên Hòa", "Số 30 Phạm Văn Thuận", "", "Kinh", "2010-05-05", "3600123456", "Trần Văn Chủ", "Chủ doanh nghiệp", "0912345678", defaultPwd],
    ["Hoàng Văn Em", "0123456795", "007099001240", "0968123456", "hoangvanem@email.com", "individual", "pending", "2026-07-03 15:45:00", "06", "Ninh Kiều", "Số 12 Hai Bà Trưng", "Nam", "Kinh", "1992-09-25", "", "", "", "", defaultPwd],
    ["Vũ Thị Phương", "0123456796", "008099001241", "0944223344", "vuthiphuong@email.com", "individual", "approved", "2026-06-28 09:10:00", "23", "Từ Sơn", "Số 7 Lý Thường Kiệt", "Nữ", "Kinh", "1987-02-14", "", "", "", "", defaultPwd],
  ];
  for (const u of seedUsers) {
    await query(
      `INSERT INTO users (full_name, bhxh_code, cccd, phone, email, account_type, status, registered_at, province, ward, street, gender, ethnicity, birth_date, tax_code, representative_name, representative_position, representative_phone, password_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
      u
    );
  }

  await query(`
    INSERT INTO appointments (full_name, phone, email, bhxh_code, date, time_slot, service, note, status, created_at)
    VALUES
      ('Nguyễn Văn An', '0912345678', 'nguyenvanan@email.com', '0123456789', '2026-07-10', '08:30 - 09:30', 'kekhai', 'Cần tư vấn thủ tục kê khai BHXH', 'confirmed', '2026-07-05 10:30:00'),
      ('Trần Thị Bình', '0987654321', 'tranthibinh@email.com', '0123456790', '2026-07-11', '14:30 - 15:30', 'huong-dan', 'Hướng dẫn nộp hồ sơ điện tử', 'pending', '2026-07-05 14:20:00')
  `);
  console.log("[DB] Seed users and appointments created");
  console.log(`[DB] Demo account password: ${DEMO_PASSWORD} (dùng để đăng nhập tài khoản demo)`);
}

export default pool;
