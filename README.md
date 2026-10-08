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

## Triển khai Cloudflare

Website chạy trên Cloudflare Workers Static Assets, Worker `app-design-luan`, đã nối với repository GitHub này. Mỗi lần cập nhật nhánh `main`, Cloudflare Workers Builds chạy `npx wrangler deploy`.

Lệnh deploy đọc `build.command` trong `wrangler.jsonc` (`node scripts/build.mjs`) và tạo thư mục `dist/` ngay trước khi tải website lên. Build không cài dependency. Worker name trong dashboard phải giữ là `app-design-luan` để khớp `name` trong `wrangler.jsonc`.

Địa chỉ website:

https://app-design-luan.luanlengoc1991.workers.dev

Tiến trình build nằm trong Cloudflare dashboard: **Workers & Pages → app-design-luan → Deployments**. Không commit token Cloudflare vào source.

Triển khai thủ công trên máy đã đăng nhập Cloudflare:

```bash
npx wrangler@4 login
npm run deploy
```

CSS/JS trong `dist/assets` có hash nội dung và cache một năm với `immutable`; HTML kiểm tra lại cache để lấy tên asset mới. `_headers` được Cloudflare áp dụng, GitHub Pages bỏ qua. Các đường dẫn asset tương đối vẫn dùng được trên GitHub Pages. Trang 404 trả về cho đường dẫn không tồn tại thay vì tải nhầm HTML như JavaScript.

Canvas gom các sự kiện kéo vào một lần vẽ mỗi frame, thumbnail layer được dùng lại khi nội dung không đổi. Dữ liệu IndexedDB thuộc từng domain: muốn chuyển từ GitHub Pages sang Cloudflare, tải dự án JSON từ domain cũ rồi mở lại ở domain mới.

Workflow GitHub Pages vẫn được giữ song song.

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

## Kích hoạt AI trên Cloudflare Workers

Đã tích hợp RevidAPI cho tạo ảnh và xoá nền; giữ fal.ai cho tách poster nhiều layer và các tác vụ riêng. Chưa thể thực hiện inference nếu tài khoản triển khai chưa có secrets.

### Dùng tài khoản RevidAPI của anh

1. Lấy khoá trong [RevidAPI Dashboard](https://revidapi.com/dashboard); trang [Usage](https://revidapi.com/dashboard/usage) quản lý credit/lượt dùng.
2. Trong Cloudflare **Workers & Pages → app-design-luan → Settings → Variables and Secrets**, thêm secret `REVID_API_KEY` chứa khoá RevidAPI. Không đặt khoá này trong `FAL_KEY`.
3. Thêm/giữ `AI_ACCESS_TOKEN`: mã truy cập riêng ít nhất 16 ký tự ngẫu nhiên. Deploy lại bản mới, rồi nhập mã này trong mục mở quyền AI trên website.

Nếu chỉ cấu hình RevidAPI, website bật **Tạo ảnh theo nội dung** (`gpt-image-2`) và **Xoá nền AI** (`u2net`). Backend dùng tài liệu hiện tại: `POST /v1/images/generations`, polling `GET /v1/images/jobs/{id}`; xoá nền bằng upload file qua `POST /v1/remove-background`, polling `GET /v1/job/status/{task_id}`. Hỗ trợ kết quả ảnh trả ngay và kết quả qua hàng đợi. Không tự gửi lại yêu cầu có phí hoặc thử endpoint khác khi lỗi.

Chưa thấy endpoint/mô hình RevidAPI được xác nhận trả về nhiều layer RGBA như Qwen Image Layered. Vì thế key RevidAPI không tự bật tách poster nhiều layer, làm nét ESRGAN hoặc chỉnh ảnh qua Qwen. Chức năng image-to-image của RevidAPI có tài liệu nhận URL ảnh tham chiếu nhưng chưa tích hợp upload/hosting ảnh cho chức năng đó trong app này; không gửi data URI tới endpoint không có xác nhận hỗ trợ. Xoá nền chỉ xuất một ảnh trong suốt, không phải bóc toàn bộ đối tượng thành nhiều layer.

Khi cả hai khoá có mặt, tạo ảnh/xoá nền ưu tiên RevidAPI; các tác vụ còn lại dùng fal.ai. API readiness và nút xử lý được tính theo từng chức năng. Không có chuyển dịch vụ dự phòng có phí tự động. Tác vụ cũ đã ký vẫn được kiểm tra bằng khoá của đúng provider, không bị chuyển sang tài khoản khác.

RevidAPI chưa có API huỷ được xác nhận trong tài liệu đã kiểm tra: nút huỷ bị khoá cho tác vụ này; tạm dừng theo dõi hoặc bỏ khỏi phiên không huỷ tác vụ ở nhà cung cấp. URL ảnh được giới hạn ở máy chủ ảnh RevidAPI có trong tài liệu; khoá không gửi theo request tải ảnh.

Tài liệu: [Tạo ảnh RevidAPI](https://docs.revidapi.com/vi/ai_studio/ai_image_generate/), [Xoá nền RevidAPI](https://docs.revidapi.com/vi/endpoints/caption/remove_background/). Các endpoint được kiểm thử bằng mock; chưa xác thực khoá tài khoản hoặc gọi inference thật.

### Kích hoạt fal.ai cho tách poster nhiều layer


| Công cụ | Model |
| --- | --- |
| Tách poster thành 2–8 layer PNG/RGBA | `fal-ai/qwen-image-layered` |
| Xoá nền người/sản phẩm | RevidAPI `u2net`; hoặc `fal-ai/ben/v2/image` nếu chỉ có fal.ai |
| Làm nét, tăng độ phân giải 2× | `fal-ai/esrgan` (không bật phục dựng mặt) |
| Tạo ảnh theo nội dung | RevidAPI `gpt-image-2`; hoặc `fal-ai/qwen-image` nếu chỉ có fal.ai |
| Chỉnh ảnh theo mô tả, phối cảnh | `fal-ai/qwen-image-edit-2511` |

1. Tạo tài khoản [fal.ai](https://fal.ai/), bổ sung số dư và lấy key tại [Dashboard → Keys](https://fal.ai/dashboard/keys). Dịch vụ tính phí theo tác vụ/model; kiểm tra mức phí và giới hạn tài khoản tại fal.ai trước khi dùng.
2. Vào Cloudflare **Workers & Pages → app-design-luan → Settings → Variables and Secrets**, thêm hai biến **Secret**:
   - `FAL_KEY`: khoá fal.ai. Chỉ nằm ở Worker, không nhập vào website hoặc commit GitHub.
   - `AI_ACCESS_TOKEN`: tự đặt mã truy cập riêng, ít nhất 16 ký tự ngẫu nhiên. Mã này dùng để mở quyền AI trên website, không phải khoá fal.ai.
3. Lưu và triển khai bản mới từ nhánh `main`. Nếu Cloudflare Git integration đã bật, commit mới tự kích hoạt build; nếu chưa bật, kết nối repository hoặc chạy `npm run deploy` trên máy đã đăng nhập.
4. Trên website, mở **Mở quyền sử dụng AI**, nhập mã `AI_ACCESS_TOKEN`. Mã chỉ giữ trong bộ nhớ tab và mất khi tải lại, không lưu trong localStorage/sessionStorage.

**Tách poster:** tải ảnh (layer vừa nhập được chọn tự động), chọn tác vụ tách layer và 2–8 layer mong muốn, bấm **Bắt đầu xử lý AI**. Có thể chọn toàn bộ thiết kế đang hiển thị thay vì layer đang chọn. Chờ kết quả, xem trước từng layer rồi bấm **Thêm vào thiết kế**. Layer nguồn được giữ và ẩn; PNG mới đặt trên đúng vùng ảnh đầu vào. Có thể đổi tên, kéo, thay thứ tự, xuất từng PNG hoặc ZIP. Mô tả trong tác vụ tách là caption giúp model hiểu ảnh; không đảm bảo tách đúng từng đối tượng theo danh sách.

Tác vụ giữ trong sessionStorage dưới dạng mã được ký, không lưu ảnh đầu vào ở đó. Sau khi tải lại cùng tab, mở quyền AI rồi bấm **Kiểm tra kết quả** để lấy lại tác vụ trong 24 giờ. Phải giữ/mở lại đúng dự án ban đầu để thêm kết quả; nếu dự án đã đổi, ứng dụng chặn nhập và cho tải ZIP. **Tạm dừng theo dõi** chỉ dừng polling; **Huỷ tác vụ** gửi yêu cầu huỷ nhưng tác vụ đã xử lý vẫn có thể tính phí. **Bỏ khỏi phiên** không huỷ tác vụ trên fal.ai. Không tự gửi lại yêu cầu AI khi polling hoặc tải kết quả lỗi.

Ảnh đầu vào AI giảm xuống cạnh 1.536 px (2.048 px khi upscale), giữ alpha PNG; kết quả không khôi phục độ phân giải gốc bằng cách đặt lại vào khung lớn. Chất lượng cần kiểm tra trên poster thực tế, đặc biệt chữ tiếng Việt, logo, khuôn mặt và chi tiết nhỏ. AI là xử lý tạo sinh; không bảo đảm giữ mặt 100%. Chữ tách là ảnh raster, chưa có OCR/text có thể sửa; không khôi phục chính xác layer PSD/AI/CDR/Canva. Phối cảnh/file in không được hiệu chỉnh kỹ thuật tự động; chưa tạo đường cắt CNC/vector chuẩn.

Ảnh dùng công cụ thủ công vẫn xử lý cục bộ. Khi chạy AI, ảnh được gửi đến dịch vụ của tác vụ (RevidAPI hoặc fal.ai) và kết quả nằm trên hệ thống của nhà cung cấp theo chính sách của họ. App tải kết quả về ảnh nhúng PNG để lưu dự án JSON. Chưa có R2/cloud project storage hoặc đồng bộ nhiều máy; dùng JSON để sao lưu.

Backend chỉ cho các model đã định sẵn, xác thực mọi request có phí, kiểm tra Origin, giới hạn dung lượng, ký mã tác vụ/kết quả có hạn, chặn proxy URL tuỳ ý và không trả provider key cho client. Mã truy cập là quyền của chủ website; chưa có tài khoản người dùng, hạn mức riêng, Turnstile hay quản trị chi phí đa người dùng. Chỉ chia sẻ mã với người được phép sử dụng số dư fal.ai. API trả `no-store`; asset tĩnh vẫn đi trực tiếp qua Cloudflare.

Chạy backend trên máy cá nhân: copy `.dev.vars.example` thành `.dev.vars`, điền secrets cục bộ rồi chạy `npm run dev:ai`. `.dev.vars` đã được bỏ qua bởi Git. `npm run dev` chỉ chạy giao diện tĩnh.

Tài liệu chính thức: [Layered model](https://fal.ai/models/fal-ai/qwen-image-layered/api), [Queue API](https://fal.ai/docs/documentation/model-apis/inference/queue), [Cloudflare routing](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/).

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
| `assets/ai.js` | Giao diện AI, theo dõi queue, xem trước và nhập layer |
| `worker/index.mjs` | Backend AI và bảo vệ provider key |
| `worker/revid.mjs` | Tích hợp tạo ảnh/xoá nền RevidAPI |
| `assets/app.js` | Canvas/layer, xuất file, lưu dự án, tổng hợp video |
| `scripts/serve.mjs` | Máy chủ phát triển cục bộ |
| `scripts/build.mjs` | Build asset fingerprint vào `dist/` |
| `wrangler.jsonc` | Cấu hình Cloudflare Workers Static Assets |
| `public/` | Header cache và trang 404 |
| `tests/` | Kiểm tra build, cache asset và tối ưu render |

Không lưu ảnh/video đầu vào hoặc dự án cá nhân trong repository. JSON/PNG/ZIP xuất từ ứng dụng được người dùng tải về máy.

## Kiểm tra

Đã kiểm tra cú pháp JavaScript, canvas mẫu sáu layer, kích thước PNG, độ trong suốt của layer riêng, XML của SVG, checksum ZIP và tiếng Việt, cấu trúc dự án và chặn ảnh URL bên ngoài trong JSON. Chạy `npm run check` để kiểm tra cú pháp, fingerprint asset, build lặp lại, đường dẫn root/subpath, header và cơ chế render/thumbnail. Kiểm tra thêm luồng AI bằng provider/DOM mô phỏng: xác thực, payload, queue, tải ảnh, huỷ, nhập layer đúng vị trí, chặn kết quả trễ và xuất ZIP. Chưa chạy inference với key thật hoặc kiểm thử chất lượng model trên poster thật.
