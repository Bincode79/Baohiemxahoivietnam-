// TODO: Bổ sung dữ liệu wards cho đầy đủ 34 tỉnh (theo Nghị quyết 202/2025/QH15).
// Hiện chỉ có Hà Nội và Hồ Chí Minh. Khi có đủ dữ liệu sẽ bổ sung provinces.open-api.vn
// hoặc file data riêng được generate từ nguồn chính thống.
export const WARDS_DATA: Record<string, { name: string; code: string }[]> = {
  "01": [
    { name: "Phường Cầu Giấy", code: "001" },
    { name: "Phường Dịch Vọng Hậu", code: "002" },
    { name: "Phường Dịch Vọng", code: "003" },
    { name: "Phường Trung Hòa", code: "004" },
    { name: "Phường Nghĩa Đô", code: "005" },
    { name: "Phường Nghĩa Tân", code: "006" },
    { name: "Quận Đống Đa", code: "010" },
    { name: "Quận Hoàn Kiếm", code: "020" },
    { name: "Quận Thanh Xuân", code: "030" },
  ],
  "03": [
    { name: "Quận 1", code: "001" },
    { name: "Quận 3", code: "002" },
    { name: "Quận 4", code: "003" },
    { name: "Quận 5", code: "004" },
    { name: "Quận 6", code: "005" },
    { name: "Quận 7", code: "006" },
    { name: "Quận 8", code: "007" },
    { name: "Quận 10", code: "008" },
    { name: "Quận 11", code: "009" },
    { name: "Quận 12", code: "010" },
  ],
};

export function getWardsByProvince(provinceCode: string): { name: string; code: string }[] {
  return WARDS_DATA[provinceCode] || [];
}
