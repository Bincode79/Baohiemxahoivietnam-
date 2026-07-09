// eslint-disable-next-line @typescript-eslint/no-var-requires
const swaggerJsdoc = require("swagger-jsdoc") as (opts: object) => object;

const options = {
  definition: {
    openapi: "3.0.3",
    info: {
      title: "Bảo hiểm Xã hội Việt Nam — API",
      version: "1.0.0",
      description:
        "API cho cổng thông tin điện tử BHXH Việt Nam. Bao gồm đăng ký tài khoản, đặt lịch hẹn, quản trị, chat hỗ trợ, và sinh mã VietQR.",
      contact: { name: "BHXH Việt Nam" },
    },
    servers: [
      { url: "http://localhost:3001", description: "Development" },
    ],
    tags: [
      { name: "Public", description: "Dữ liệu công khai (tỉnh, phường, đơn vị BHXH)" },
      { name: "Auth", description: "Đăng nhập / Đăng ký" },
      { name: "Admin", description: "Quản trị (yêu cầu xác thực)" },
      { name: "Appointments", description: "Đặt lịch hẹn" },
      { name: "VietQR", description: "Sinh mã VietQR theo chuẩn EMVCo" },
      { name: "Chat", description: "Hỗ trợ trực tuyến" },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "token",
          description: "Token nhận được từ `/api/auth/login` hoặc `/api/admin/login`",
        },
      },
      schemas: {
        SuccessResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            message: { type: "string", example: "Thành công" },
            data: { type: "object", description: "Dữ liệu trả về" },
          },
        },
        ErrorResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: false },
            message: { type: "string", example: "Lỗi" },
            code: { type: "string", example: "VALIDATION_ERROR" },
          },
        },
      },
    },
    security: [{ BearerAuth: [] }],
  },
  apis: ["./src/routes/*.ts"],
};

export const swaggerSpec = swaggerJsdoc(options) as object;
