# Luân Design Studio

Website chỉnh sửa ảnh theo layer, phát triển từ quy trình quan sát trong video Bendesign AI. Thương hiệu riêng của Luân; không phải ứng dụng Bendesign chính thức.

## Chạy website

Tải toàn bộ repository, giải nén và mở `index.html` bằng Chrome hoặc Edge. Giữ nguyên thư mục `assets` cạnh file HTML.

Để làm việc trong Cursor/Claude với Node.js 20 trở lên:

```bash
npm run dev
```

Mở `http://127.0.0.1:3000`. Không cần cài thư viện npm. Máy chủ này chỉ phục vụ phát triển trên máy cá nhân.

## Tạo bản triển khai

```bash
npm run check
npm run build
```

Website tĩnh được tạo trong thư mục `dist/`. Cấu hình hosting dùng lệnh build `npm run build`, thư mục đầu ra `dist`. Đã cấu hình GitHub Actions trong `.github/workflows/deploy-pages.yml`: mỗi lần cập nhật nhánh `main`, hệ thống kiểm tra JavaScript, build và triển khai GitHub Pages.

Thiết lập một lần tại **Settings → Pages → Build and deployment → Source → GitHub Actions**. Nếu Pages chưa bật, job build vẫn chạy nhưng bước triển khai sẽ thất bại cho đến khi hoàn tất thiết lập này.

Xem tiến trình trong tab **Actions → Deploy Luân Design Studio**. Sau khi triển khai thành công, GitHub hiển thị URL website trong môi trường `github-pages`. Có thể chạy lại thủ công bằng **Run workflow**.

## Chức năng đã có

- Nhập PNG, JPEG, WebP qua chọn file hoặc kéo thả.
- Tạo khung mới với tỷ lệ phổ biến và kích thước tuỳ chọn.
- Tách vùng chữ nhật/đa giác thành layer mới; layer nguồn giữ lại và ẩn.
- Xoá màu nền đơn sắc với dung sai điều chỉnh được.
- Thêm/sửa chữ, màu, cỡ, vị trí và độ rõ.
- Di chuyển, nhân bản, ẩn/hiện và đổi thứ tự layer.
- Xem toàn bộ thiết kế hoặc layer riêng; thu phóng, hoàn tác/làm lại.
- Xuất PNG gộp, PNG riêng, ZIP tất cả layer trên cùng khung.
- Xuất SVG với ảnh raster nhúng và chữ dạng text; không tự vector hoá ảnh.
- Lưu/mở dự án JSON; lưu bản hiện tại trong IndexedDB của trình duyệt.
- Tổng hợp video trong nút “Đọc nội dung video”, dựa trên khung hình và thao tác nhìn thấy; chưa phiên âm âm thanh.

## Chưa có AI và backend

**Bản hiện tại là trình chỉnh sửa thủ công, chưa kết nối dịch vụ AI.**

Các mục phục dựng ảnh, thiết kế theo nội dung, biển bảng, phối cảnh, xử lý file in và CNC chỉ hỗ trợ soạn/tải yêu cầu thiết kế. Chưa có tự nhận diện đối tượng, bóc tách toàn bộ layer bằng AI, dựng lại nền bị che, tạo ảnh hoặc tạo đường cắt CNC.

Để bổ sung cần backend xử lý ảnh, dịch vụ AI phù hợp, xác thực, quản lý chi phí và lưu trữ. Giữ khoá API ở backend, không đặt trong HTML/JavaScript hoặc commit vào GitHub.

Không có đăng nhập hoặc đồng bộ cloud. Ảnh nhập được xử lý trong trình duyệt, không gửi lên máy chủ. Bản lưu trình duyệt có thể mất khi xoá dữ liệu; tải JSON để sao lưu hoặc chuyển máy.

## Giới hạn và xuất in

- Tối đa 64 layer; cạnh khung 4.096 px.
- Tối đa 15 MB mỗi ảnh nhập; ảnh lớn được giảm xuống cạnh tối đa 4.096 px.
- Hoàn tác giữ 15 trạng thái gần nhất.
- Xoá nền theo màu có thể ảnh hưởng chi tiết cùng màu.
- PNG dùng RGB. Kiểm tra kích thước vật lý, DPI, CMYK và đường cắt trong phần mềm chế bản trước khi in.
- SVG không phải file AI/CDR gốc và không khôi phục chính xác layer nguồn từ ảnh phẳng.

## Cấu trúc

| File | Nội dung |
| --- | --- |
| `index.html` | Giao diện, hộp thoại và biểu tượng |
| `assets/styles.css` | Giao diện responsive |
| `assets/app.js` | Canvas/layer, xuất file, lưu dự án, tổng hợp video |
| `scripts/serve.mjs` | Máy chủ phát triển cục bộ |
| `scripts/build.mjs` | Đóng gói website vào `dist/` |

Không lưu ảnh/video đầu vào hoặc dự án cá nhân trong repository. JSON/PNG/ZIP xuất từ ứng dụng được người dùng tải về máy.

## Kiểm tra

Đã kiểm tra cú pháp JavaScript, canvas mẫu sáu layer, kích thước PNG, độ trong suốt của layer riêng, XML của SVG, checksum ZIP và tiếng Việt, cấu trúc dự án và chặn ảnh URL bên ngoài trong JSON. Chưa kiểm thử toàn bộ thao tác trên trình duyệt thực hoặc triển khai hosting.
