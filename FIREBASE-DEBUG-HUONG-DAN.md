# Kiểm tra Firebase trên GitHub Pages

1. Upload file `debug.html` **cùng thư mục** với `index.html` và `firebase-config.js` trong repository đã phát hành GitHub Pages.
2. Mở `https://TEN_USER.github.io/TEN_REPO/debug.html` (thay tên của bạn).
3. Bấm **Chạy kiểm tra Firebase**.
4. Xem bước đầu tiên báo lỗi và dòng **Hướng xử lý**. Bấm **Sao chép báo cáo** rồi gửi để sửa tiếp.

Trang kiểm tra: (1) config; (2) tải Firebase SDK; (3) anonymous authentication; (4) RTDB kết nối; (5) ghi dữ liệu; (6) đọc dữ liệu; (7) xóa bản ghi test. Các bản ghi test nằm trong `rooms/DEBUG_...` theo cấu trúc game hiện tại.

### Những mục bắt buộc
- Firebase **Authentication → Sign-in method → Anonymous: Enabled**.
- Firebase **Realtime Database** (không phải Firestore): copy đúng **databaseURL**.
- Firebase **Realtime Database → Rules**: phải được **Publish** theo `database.rules.json` dành cho prototype. Đây chỉ là rules thử nghiệm, không sử dụng để phát hành cho công chúng.
- File `firebase-config.js` được upload lên **đúng branch/thư mục** đã chọn trong GitHub Pages; có `apiKey`, `authDomain`, `databaseURL`, `projectId`, `appId`.
- Nếu thêm authorized domain, dùng `TEN_USER.github.io` không kèm `https://`, dấu `/` hay tên repo. Thêm domain không tự kích hoạt Anonymous Auth.

Nếu `debug.html` xuất hiện 404, hãy kiểm tra GitHub repository → Settings → Pages → Source và Deployment. Nếu trang không tải thư viện, hãy mở F12 → Console / Network; một số mạng hoặc extension chặn CDN.
