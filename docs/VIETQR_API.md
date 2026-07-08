# API VietQR - Hướng dẫn sử dụng

## Tổng quan

API VietQR cho phép tạo mã QR thanh toán theo chuẩn VietQR thực tế, tương thích với tất cả ứng dụng ngân hàng tại Việt Nam.

---

## Các API Endpoints

### 1. Tạo mã QR với thông tin tự chọn

**Endpoint:** `POST /api/vietqr/create`

**Request Body:**
```json
{
  "bankBin": "970436",        // Mã BIN ngân hàng (6 số)
  "accountNumber": "1234567890", // Số tài khoản
  "accountName": "NGUYEN VAN A", // Tên chủ tài khoản
  "amount": "500000",         // Số tiền (VNĐ)
  "content": "Nop BHXH thang 7/2026" // Nội dung chuyển khoản
}
```

**Response:**
```json
{
  "success": true,
  "qrData": "0002010102123856100000012345678905802VN...",
  "bank": {
    "bin": "970436",
    "name": "VCB",
    "fullName": "Ngân hàng TMCP Ngoại Thương Việt Nam"
  },
  "account": {
    "number": "1234567890",
    "name": "NGUYEN VAN A"
  },
  "amount": "500000",
  "content": "Nop BHXH thang 7/2026",
  "currency": "VND",
  "createdAt": "2026-07-05T22:30:00.000Z"
}
```

---

### 2. Tạo mã QR theo mẫu BHXH có sẵn

**Endpoint:** `POST /api/vietqr/template`

**Request Body:**
```json
{
  "template": "bhxh-thang",    // Loại mẫu
  "amount": "500000",          // Số tiền (tùy chọn)
  "bhxhCode": "0123456789",   // Mã BHXH (tùy chọn)
  "userName": "Nguyen Van A"  // Tên người dùng (tùy chọn)
}
```

**Các loại template:**
| Template | Mô tả | Số tiền mặc định |
|----------|--------|-------------------|
| `bhxh-thang` | BHXH tự nguyện hàng tháng | 500,000 VNĐ |
| `bhyt-nam` | BHYT tự nguyện cả năm | 1,200,000 VNĐ |
| `bhtn-quy` | BHTN theo quý | 300,000 VNĐ |
| `no-bhxh` | Thanh toán nợ BHXH | 0 VNĐ |

---

### 3. Tạo mã QR cho người dùng (theo cài đặt đã lưu)

**Endpoint:** `GET /api/vietqr/user/:userId`

**Response:**
```json
{
  "success": true,
  "qr_enabled": true,
  "data": {
    "qrData": "000201010212...",
    "bankBin": "970436",
    "bankName": "VCB",
    "accountNumber": "1234567890",
    "accountName": "NGUYEN VAN A",
    "amount": "500000",
    "content": "Nop BHXH tu nguyen 7/2026",
    "fullName": "Nguyễn Văn A",
    "bhxhCode": "0123456789"
  }
}
```

---

### 4. Lấy danh sách ngân hàng hỗ trợ

**Endpoint:** `GET /api/vietqr/banks`

**Response:**
```json
{
  "success": true,
  "banks": [
    { "bin": "970436", "name": "VCB", "fullName": "Ngân hàng TMCP Ngoại Thương Việt Nam" },
    { "bin": "970418", "name": "BIDV", "fullName": "Ngân hàng TMCP Đầu tư và Phát triển Việt Nam" },
    { "bin": "970415", "name": "VTB", "fullName": "Ngân hàng TMCP Công thương Việt Nam" },
    { "bin": "970405", "name": "AGR", "fullName": "Ngân hàng TMCP Nông nghiệp và Phát triển Nông thôn Việt Nam" },
    { "bin": "970426", "name": "MB", "fullName": "Ngân hàng TMCP Quân đội" },
    { "bin": "970407", "name": "TCB", "fullName": "Ngân hàng TMCP Kỹ thương Việt Nam" },
    { "bin": "970416", "name": "ACB", "fullName": "Ngân hàng TMCP Á Châu" },
    { "bin": "970432", "name": "VPB", "fullName": "Ngân hàng TMCP Việt Nam Thịnh Vượng" },
    { "bin": "970443", "name": "SHB", "fullName": "Ngân hàng TMCP Sài Gòn - Hà Nội" },
    { "bin": "970425", "name": "HDB", "fullName": "Ngân hàng TMCP Phát triển Thành phố Hồ Chí Minh" },
    { "bin": "970403", "name": "STB", "fullName": "Ngân hàng TMCP Sài Gòn Thương Tín" },
    { "bin": "970400", "name": "TPB", "fullName": "Ngân hàng TMCP Tiên Phong" },
    { "bin": "970448", "name": "OCB", "fullName": "Ngân hàng TMCP Phương Đông" }
  ]
}
```

---

### 5. Tạo mã QR đầy đủ (cho admin)

**Endpoint:** `POST /api/vietqr/generate`

**Request Body:**
```json
{
  "bankBin": "970436",
  "accountNumber": "1234567890",
  "accountName": "BOI HOI XA HOI VIET NAM",
  "amount": "500000",
  "content": "Nop BHXH tu nguyen",
  "template": "bhxh"  // Tùy chọn: 'bhxh', 'bhyt', 'bhtn', 'custom'
}
```

---

## Danh sách mã BIN ngân hàng phổ biến

| Mã BIN | Tên viết tắt | Tên đầy đủ |
|--------|--------------|-------------|
| 970436 | VCB | Vietcombank |
| 970418 | BIDV | BIDV |
| 970415 | VTB | VietinBank |
| 970405 | AGR | Agribank |
| 970426 | MB | MB Bank |
| 970407 | TCB | Techcombank |
| 970416 | ACB | ACB |
| 970432 | VPB | VPBank |
| 970443 | SHB | SHB |
| 970425 | HDB | HDBank |
| 970403 | STB | Sacombank |
| 970400 | TPB | TPBank |
| 970448 | OCB | OCB |

---

## Ví dụ sử dụng với cURL

### Tạo mã QR cho BHXH tháng:
```bash
curl -X POST http://localhost:3001/api/vietqr/create ^
  -H "Content-Type: application/json" ^
  -d "{\"bankBin\":\"970436\",\"accountNumber\":\"1234567890\",\"accountName\":\"NGUYEN VAN A\",\"amount\":\"500000\",\"content\":\"Nop BHXH tu nguyen thang 7/2026 0123456789\"}"
```

### Tạo mã QR theo mẫu có sẵn:
```bash
curl -X POST http://localhost:3001/api/vietqr/template ^
  -H "Content-Type: application/json" ^
  -d "{\"template\":\"bhxh-thang\",\"amount\":\"500000\",\"bhxhCode\":\"0123456789\"}"
```

### Lấy danh sách ngân hàng:
```bash
curl http://localhost:3001/api/vietqr/banks
```

---

## Mã QR có thể quét được bằng

- Ứng dụng ngân hàng: Vietcombank, BIDV, VietinBank, Agribank, MB, Techcombank, ACB, VPBank...
- Ví điện tử: MoMo, ZaloPay, VNPay...
- Tất cả ứng dụng hỗ trợ quét mã QR VietQR

---

## Lưu ý quan trọng

1. **Mã QR theo chuẩn VietQR** - Tương thích với tất cả ngân hàng tại Việt Nam
2. **Số tiền = 0** - Người dùng sẽ tự nhập số tiền khi quét
3. **Nội dung chuyển khoản** - Nên chứa mã BHXH để dễ đối soát
4. **CRC-16 checksum** - Đảm bảo mã QR không bị lỗi
5. **UTF-8 encoding** - Hỗ trợ tiếng Việt trong tên tài khoản
