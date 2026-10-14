# Sổ tay riêng

Ứng dụng Cloudflare Workers mới, tách khỏi Luân Design Studio và Worker `websiteluancloudfare`.

Ghi chú chỉ nằm trong `localStorage` của trình duyệt. Không có tài khoản, cơ sở dữ liệu, hay khoá API.

## Chạy cục bộ

```bash
cd du-an-rieng
npm install
npm run check
npm run dev
```

## Triển khai

```bash
npx wrangler deploy
```

Worker tên `du-an-rieng`. Tài nguyên tĩnh nằm trong `public/`. Đường dẫn `/api/*` đi vào Worker trước; các đường dẫn khác được phục vụ như tệp tĩnh.
