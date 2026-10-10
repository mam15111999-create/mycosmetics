# Chatbot AI trên trang khách — hướng dẫn deploy Cloudflare Worker

Worker này đóng vai trò **proxy** giấu API key Google Gemini, nhận câu hỏi từ trang khách và trả về câu trả lời của AI dựa trên danh mục sản phẩm của shop.

## Yêu cầu
- Tài khoản Cloudflare (miễn phí, không cần thẻ): https://dash.cloudflare.com/sign-up
- Node.js 18+ trên máy tính (chỉ cần cho lần deploy đầu tiên)
- API key Google Gemini (miễn phí 1500 req/ngày): https://ai.google.dev/gemini-api/docs/api-key

## Deploy lần đầu (5-10 phút)

### 1. Lấy API key Gemini
1. Vào https://aistudio.google.com/apikey
2. Đăng nhập Google → **Create API key** → **Create API key in new project**
3. Copy key (dạng `AIzaSy...`)

### 2. Cài wrangler (CLI của Cloudflare)
Mở Terminal / PowerShell:
```bash
npm install -g wrangler
```

### 3. Đăng nhập Cloudflare
```bash
wrangler login
```
→ Mở trình duyệt, bạn đăng nhập CF account, bấm Allow.

### 4. Deploy worker
Trong thư mục này (`worker/`):
```bash
wrangler deploy worker.js --name hoanghien-ai
```

Lần đầu wrangler sẽ hỏi:
- `Would you like to create a new worker?` → **Yes**
- `What type of worker would you like to create?` → **Fetch handler** (hoặc chọn mặc định)

Sau khi deploy xong, nó in URL dạng:
```
https://hoanghien-ai.<your-subdomain>.workers.dev
```
**Copy URL này**.

### 5. Set biến môi trường API key
```bash
wrangler secret put GEMINI_KEY --name hoanghien-ai
```
→ Dán API key Gemini vào, Enter.

### 6. (Tùy chọn) Cho phép domain khác gọi
Nếu bạn test từ domain khác ngoài hoanghiencosmetics.com:
```bash
wrangler secret put ALLOW_ORIGIN --name hoanghien-ai
```
→ Nhập ví dụ `*` (cho phép tất cả, chỉ dùng khi test) hoặc `https://domain-của-bạn.com`

### 7. Dán URL vào Cài đặt admin
1. Mở trang admin, vào **Cài đặt**
2. Tìm phần **🤖 Chatbot AI** → dán URL Worker vừa copy ở bước 4
3. Lưu

**Xong!** Khách vào trang shop sẽ thấy nút chat 💬 ở góc.

## Cập nhật về sau
Khi muốn sửa logic worker, chạy lại:
```bash
wrangler deploy worker.js --name hoanghien-ai
```

## Giới hạn miễn phí
- **Cloudflare Workers**: 100.000 request/ngày — thừa dùng cho shop nhỏ
- **Gemini 1.5 Flash**: 1500 request/ngày, 15 req/phút — đủ dùng
- Vượt quota → chatbot báo lỗi; đợi reset hoặc nâng cấp.

## Kiểm tra Worker chạy chưa
```bash
curl -X POST https://hoanghien-ai.<your-subdomain>.workers.dev \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"hello"}],"products":[]}'
```
Phải trả về JSON có trường `reply`.

## Khắc phục lỗi thường gặp
| Lỗi | Nguyên nhân | Khắc phục |
|---|---|---|
| 403 CORS | Domain khác | Set `ALLOW_ORIGIN` đúng domain |
| 500 "Chưa cấu hình GEMINI_KEY" | Chưa set secret | Bước 5 |
| 502 Gemini lỗi 429 | Vượt quota | Chờ 1 phút hoặc nâng gói Gemini |
| 502 Gemini lỗi 400 | Catalog quá dài | Giảm số SP gửi lên (hiện giới hạn 200) |
