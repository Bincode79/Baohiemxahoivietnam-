import { Router } from "express";
import { query } from "../db";
import { successResponse, errorResponse } from "../types/response";
import type { Request, Response } from "express";

const router = Router();

/**
 * Che 1 phần CCCD để hiển thị công khai. Giữ 3 số đầu + 3 số cuối.
 * Ví dụ: "012345678901" → "012******901"
 */
function maskCccd(value: string): string {
  if (!value) return "";
  const digits = String(value).replace(/\D/g, "");
  if (digits.length < 6) return "*".repeat(digits.length);
  return digits.slice(0, 3) + "*".repeat(digits.length - 6) + digits.slice(-3);
}

/**
 * Che SĐT, giữ 3 số đầu + 2 số cuối. Ví dụ: "0912345678" → "091***78"
 */
function maskPhone(value: string): string {
  if (!value) return "";
  const digits = String(value).replace(/\D/g, "");
  if (digits.length < 5) return "*".repeat(digits.length);
  return digits.slice(0, 3) + "*".repeat(digits.length - 5) + digits.slice(-2);
}

// Supported banks
const SUPPORTED_BANKS: Record<string, { bin: string; name: string; fullName: string }> = {
  "970436": { bin: "970436", name: "VCB", fullName: "Ngân hàng TMCP Ngoại Thương Việt Nam" },
  "970418": { bin: "970418", name: "BIDV", fullName: "Ngân hàng TMCP Đầu tư và Phát triển Việt Nam" },
  "970415": { bin: "970415", name: "VTB", fullName: "Ngân hàng TMCP Công thương Việt Nam" },
  "970405": { bin: "970405", name: "AGR", fullName: "Ngân hàng TMCP Nông nghiệp và Phát triển Nông thôn Việt Nam" },
  "970426": { bin: "970426", name: "MB", fullName: "Ngân hàng TMCP Quân đội" },
  "970407": { bin: "970407", name: "TCB", fullName: "Ngân hàng TMCP Kỹ thuật Việt Nam" },
  "970416": { bin: "970416", name: "ACB", fullName: "Ngân hàng TMCP Á Châu" },
  "970432": { bin: "970432", name: "VPB", fullName: "Ngân hàng TMCP Việt Nam Thịnh Vượng" },
  "970422": { bin: "970422", name: "EIB", fullName: "Ngân hàng TMCP Xuất Nhập Khẩu Việt Nam" },
  "970443": { bin: "970443", name: "SHB", fullName: "Ngân hàng TMCP Sài Gòn - Hà Nội" },
  "970425": { bin: "970425", name: "HDB", fullName: "Ngân hàng TMCP Phát triển Thành phố Hồ Chí Minh" },
  "970431": { bin: "970431", name: "CTG", fullName: "Ngân hàng TMCP Công thương Việt Nam" },
  "970403": { bin: "970403", name: "STB", fullName: "Ngân hàng TMCP Sài Gòn Thương Tín" },
  "970400": { bin: "970400", name: "TPB", fullName: "Ngân hàng TMCP Tiên Phong" },
  "970448": { bin: "970448", name: "OCB", fullName: "Ngân hàng TMCP Phương Đông" },
  "970438": { bin: "970438", name: "PGB", fullName: "Ngân hàng TMCP Xăng dầu Petrolimex" },
  "970429": { bin: "970429", name: "GPB", fullName: "Ngân hàng TMCP Dầu khí Toàn cầu" },
  "970437": { bin: "970437", name: "BAB", fullName: "Ngân hàng TMCP Bắc Á" },
  "970439": { bin: "970439", name: "NAB", fullName: "Ngân hàng TMCP Nam Á" },
  "970441": { bin: "970441", name: "SCB", fullName: "Ngân hàng TMCP Sài Gòn" },
  "970444": { bin: "970444", name: "SGB", fullName: "Ngân hàng TMCP Sài Gòn Công Thương" },
};

function crc16XModem(str: string): string {
  let crc = 0xffff;
  const table: number[] = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0x1021 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  for (let i = 0; i < str.length; i++) {
    crc = ((crc << 8) ^ table[((crc >>> 8) ^ str.charCodeAt(i)) & 0xff]) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function generateVietQR(params: {
  bankBin: string;
  accountNumber: string;
  accountName: string;
  amount: string;
  content: string;
  merchantCity?: string;
  bankName?: string;
  bankFullName?: string;
}): string {
  const { bankBin, accountNumber, accountName, amount, content, merchantCity = "HANOI", bankName, bankFullName } = params;

  let payload = "";

  // Payload Format Indicator
  payload += "00" + "01" + "01";

  // Point of Initiation Method (QR động)
  payload += "01" + "02";

  // GUI - VietQR
  payload += "00" + "04" + "0112";

  // Mastercard Visa Napas identifier
  payload += "01" + "12" + "A000000727";

  // Merchant Category Code
  payload += "52" + "04" + "0000";

  // Currency - VND
  payload += "53" + "03" + "704";

  // Amount
  if (amount && parseInt(amount) > 0) {
    payload += "54" + String(amount.length).padStart(2, "0") + amount;
  }

  // Country Code
  payload += "58" + "02" + "VN";

  // Merchant Name
  const nameTrimmed = accountName.trim().substring(0, 25);
  payload += "59" + String(nameTrimmed.length).padStart(2, "0") + nameTrimmed;

  // Merchant City
  const cityTrimmed = merchantCity.trim().substring(0, 25).toUpperCase();
  payload += "60" + String(cityTrimmed.length).padStart(2, "0") + cityTrimmed;

  // Bank Account
  payload += "38" + String(accountNumber.length).padStart(2, "0") + accountNumber;

  // Additional Data - chứa mã BIN ngân hàng
  const addData = "00" + bankBin;
  payload += "61" + String(addData.length).padStart(2, "0") + addData;

  // Nội dung thanh toán
  if (content) {
    const contentTrimmed = content.trim().substring(0, 50);
    const contentField = "08" + contentTrimmed;
    payload += "62" + String(contentField.length).padStart(2, "0") + contentField;
  }

  const crc = crc16XModem(payload);
  payload += "6304" + crc;

  return payload;
}

// GET /api/vietqr/banks
router.get("/banks", (_req: Request, res: Response) => {
  const banks = Object.entries(SUPPORTED_BANKS).map(([bin, info]) => ({
    bin,
    name: info.name,
    fullName: info.fullName,
  }));
  res.json(successResponse(banks));
});

// POST /api/vietqr/generate
router.post("/generate", (req: Request, res: Response) => {
  const { bankBin, accountNumber, accountName, amount, content, template } = req.body;

  if (!bankBin) return res.status(400).json(errorResponse("Mã BIN ngân hàng là bắt buộc", "VALIDATION_ERROR"));
  if (!accountNumber) return res.status(400).json(errorResponse("Số tài khoản là bắt buộc", "VALIDATION_ERROR"));
  if (!accountName) return res.status(400).json(errorResponse("Tên chủ tài khoản là bắt buộc", "VALIDATION_ERROR"));

  const bankInfo = SUPPORTED_BANKS[bankBin];
  const bankName = bankInfo?.name || bankBin;
  const bankFullName = bankInfo?.fullName || "Ngân hàng";

  let paymentContent = content || "";
  if (!paymentContent && template) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    switch (template) {
      case "bhxh":
        paymentContent = `Dong BHXH tu nguyen ${month}/${year}`;
        break;
      case "bhyt":
        paymentContent = `Dong BHYT tu nguyen nam ${year}`;
        break;
      case "bhtn":
        paymentContent = `Dong BHTN quy ${Math.ceil(month / 3)}/${year}`;
        break;
      default:
        paymentContent = `Thanh toan BHXH ${now.toLocaleDateString("vi-VN")}`;
    }
  }

  const qrData = generateVietQR({
    bankBin,
    accountNumber,
    accountName: accountName.toUpperCase(),
    amount: amount || "0",
    content: paymentContent,
    merchantCity: "HANOI",
    bankName,
    bankFullName,
  });

  res.json(successResponse({
    qrData,
    bankBin,
    bankName,
    bankFullName,
    accountNumber,
    accountName: accountName.toUpperCase(),
    amount: amount || "0",
    content: paymentContent,
    currency: "VND",
    timestamp: new Date().toISOString(),
  }, "Tạo mã QR thành công"));
});

// POST /api/vietqr/create
router.post("/create", (req: Request, res: Response) => {
  const { bankBin, accountNumber, accountName, amount, content } = req.body;

  if (!bankBin || !accountNumber || !accountName) {
    return res.status(400).json(errorResponse("Thiếu thông tin bắt buộc: bankBin, accountNumber, accountName", "VALIDATION_ERROR"));
  }

  const bankInfo = SUPPORTED_BANKS[bankBin];
  const bankName = bankInfo?.name || bankBin;
  const bankFullName = bankInfo?.fullName || "Ngân hàng";

  const qrData = generateVietQR({
    bankBin,
    accountNumber,
    accountName: accountName.toUpperCase().trim(),
    amount: amount || "0",
    content: content || "",
    merchantCity: "HANOI",
    bankName,
    bankFullName,
  });

  res.json(successResponse({
    qrData,
    bank: { bin: bankBin, name: bankName, fullName: bankFullName },
    account: { number: accountNumber, name: accountName.toUpperCase().trim() },
    amount: amount || "0",
    content: content || "",
    currency: "VND",
    createdAt: new Date().toISOString(),
  }));
});

// POST /api/vietqr/template
router.post("/template", (req: Request, res: Response) => {
  const { template, amount, bhxhCode, userName } = req.body;

  const TEMPLATES: Record<string, {
    bankBin: string;
    accountNumber: string;
    accountName: string;
    defaultAmount: string;
    contentTemplate: (code: string, month: number, year: number) => string;
  }> = {
    "bhxh-thang": {
      bankBin: "970436",
      accountNumber: "1234567890",
      accountName: "BOI HOI XA HOI VIET NAM",
      defaultAmount: "500000",
      contentTemplate: (code, month, year) =>
        `Dong BHXH tu nguyen thang ${month}/${year}${code ? " " + code : ""}`,
    },
    "bhyt-nam": {
      bankBin: "970436",
      accountNumber: "1234567890",
      accountName: "BOI HOI XA HOI VIET NAM",
      defaultAmount: "1200000",
      contentTemplate: (_code, _month, year) => `Dong BHYT tu nguyen nam ${year}`,
    },
    "bhtn-quy": {
      bankBin: "970436",
      accountNumber: "1234567890",
      accountName: "BOI HOI XA HOI VIET NAM",
      defaultAmount: "300000",
      contentTemplate: (code, month, year) =>
        `Dong BHTN quy ${Math.ceil(month / 3)}/${year}${code ? " " + code : ""}`,
    },
    "no-bhxh": {
      bankBin: "970436",
      accountNumber: "1234567890",
      accountName: "BOI HOI XA HOI VIET NAM",
      defaultAmount: "0",
      contentTemplate: (code, _month, _year) => `Thanh toan no BHXH${code ? " " + code : ""}`,
    },
  };

  const templateConfig = TEMPLATES[template as keyof typeof TEMPLATES];
  if (!templateConfig) {
    return res.status(400).json(errorResponse(`Mẫu '${template}' không tồn tại`, "INVALID_TEMPLATE"));
  }

  const now = new Date();
  const content = templateConfig.contentTemplate(
    bhxhCode || "",
    now.getMonth() + 1,
    now.getFullYear()
  );

  const finalAmount = amount || templateConfig.defaultAmount;

  const qrData = generateVietQR({
    bankBin: templateConfig.bankBin,
    accountNumber: templateConfig.accountNumber,
    accountName: templateConfig.accountName,
    amount: finalAmount,
    content,
    merchantCity: "HANOI",
    bankName: "VCB",
    bankFullName: "Ngân hàng TMCP Ngoại Thương Việt Nam",
  });

  res.json(successResponse({
    qrData,
    bankBin: templateConfig.bankBin,
    bankName: "VCB",
    bankFullName: "Ngân hàng TMCP Ngoại Thương Việt Nam",
    accountNumber: templateConfig.accountNumber,
    accountName: templateConfig.accountName,
    amount: finalAmount,
    content,
    template,
    userName: userName || "",
  }, "Tạo mã QR theo mẫu thành công"));
});

// GET /api/vietqr/user/:userId
router.get("/user/:userId", async (req: Request, res: Response) => {
  const userId = parseInt(String(req.params.userId), 10);
  try {
    const { rows } = await query(
      `SELECT u.id, u.full_name, u.bhxh_code, u.province, q.*
       FROM users u
       LEFT JOIN user_qr_settings q ON u.id = q.user_id
       WHERE u.id = $1`,
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json(errorResponse("Không tìm thấy người dùng", "NOT_FOUND"));
    }

    const user = rows[0];

    if (!user.qr_enabled) {
      return res.json(successResponse({
        qr_enabled: false,
        message: "Mã QR chưa được kích hoạt cho người dùng này",
      }));
    }

    if (!user.qr_bank_bin || !user.qr_account) {
      return res.status(400).json(errorResponse("Người dùng chưa cấu hình thông tin thanh toán", "CONFIG_MISSING"));
    }

    // Get province name for city
    const provinces: Record<string, string> = {
      "01": "HANOI", "03": "HOCHIMINH", "04": "HAIPHONG", "05": "DANANG", "06": "CANTHO"
    };
    const merchantCity = provinces[user.province] || "HANOI";

    const qrData = generateVietQR({
      bankBin: user.qr_bank_bin,
      accountNumber: user.qr_account,
      accountName: (user.qr_holder || user.full_name).trim(),
      amount: user.qr_amount || "0",
      content: user.qr_content || "",
      merchantCity,
      bankName: user.qr_bank_name || user.qr_bank_bin,
      bankFullName: "Ngân hàng",
    });

    res.json(successResponse({
      qr_enabled: true,
      qrData,
      bankBin: user.qr_bank_bin,
      bankName: user.qr_bank_name,
      accountNumber: user.qr_account,
      accountName: (user.qr_holder || user.full_name).trim(),
      amount: user.qr_amount || "0",
      content: user.qr_content,
      fullName: user.full_name,
      bhxhCode: user.bhxh_code,
      merchantCity,
    }));
  } catch (err) {
    res.status(500).json(errorResponse((err as Error).message, "INTERNAL_ERROR"));
  }
});

// GET /api/public/qr/:code
router.get("/public/:code", async (req: Request, res: Response) => {
  const code = req.params.code;
  try {
    const { rows } = await query(
      `SELECT u.id, u.full_name, u.bhxh_code, u.cccd, u.province, q.qr_enabled, q.qr_amount, q.qr_content, q.qr_bank_bin, q.qr_bank_name, q.qr_account, q.qr_holder, q.qr_payment_type, q.qr_period
       FROM users u
       LEFT JOIN user_qr_settings q ON u.id = q.user_id
       WHERE u.bhxh_code = $1 OR u.cccd = $1`,
      [code]
    );
    if (rows.length === 0) {
      return res.status(404).json(errorResponse("Không tìm thấy người dùng", "NOT_FOUND"));
    }
    const user = rows[0];
    if (!user.qr_enabled) {
      return res.json(successResponse({ qr_enabled: false, message: "Mã QR chưa được kích hoạt" }));
    }

    const provinces: Record<string, string> = {
      "01": "HANOI", "03": "HOCHIMINH", "04": "HAIPHONG", "05": "DANANG", "06": "CANTHO"
    };
    const merchantCity = provinces[user.province] || "HANOI";

    const qrData = generateVietQR({
      bankBin: user.qr_bank_bin,
      accountNumber: user.qr_account,
      accountName: (user.qr_holder || user.full_name).trim(),
      amount: user.qr_amount || "0",
      content: user.qr_content || "",
      merchantCity,
      bankName: user.qr_bank_name || user.qr_bank_bin,
      bankFullName: "Ngân hàng",
    });

    res.json(successResponse({
      qr_enabled: true,
      user_id: user.id,
      full_name: user.full_name,
      bhxh_code: user.bhxh_code,
      cccd: maskCccd(String(user.cccd || "")),
      qr_amount: user.qr_amount,
      qr_content: user.qr_content,
      qr_bank_bin: user.qr_bank_bin,
      qr_bank_name: user.qr_bank_name,
      qr_account: user.qr_account,
      qr_holder: user.qr_holder,
      qr_payment_type: user.qr_payment_type,
      qr_period: user.qr_period,
      qrData,
      merchantCity,
    }));
  } catch (err) {
    res.status(500).json(errorResponse((err as Error).message, "INTERNAL_ERROR"));
  }
});

// GET /api/user-qr/:userId
router.get("/:userId", async (req: Request, res: Response) => {
  try {
    const userId = parseInt(String(req.params.userId), 10);
    const { rows } = await query(
      "SELECT * FROM user_qr_settings WHERE user_id = $1",
      [userId]
    );
    if (rows.length === 0) {
      res.json(successResponse({
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

export { router as vietqrRoutes };
