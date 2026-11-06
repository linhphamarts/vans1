# VAN RIVALS — 3D Browser Multiplayer Prototype

Một mẫu thử 3D rất đơn giản bằng Three.js, HTML và Firebase Realtime Database để thử nghiệm ý tưởng **2 đội đẩy hai xe van trên cùng bản đồ**. **Không phải bản hoàn chỉnh/production**, chưa có vật lý xe thực tế hay bảo mật chống gian lận.

## Có gì?
- Giao diện chọn tên, mã phòng, nút Play; phân đội **A, B, A, B… theo thứ tự vào phòng** (giao dịch nguyên tử Firebase); giới hạn 6 tài khoản / phòng.
- Mỗi đội có van riêng, chung bản đồ. WASD di chuyển, F đẩy van.
- E lấy gỗ (gần Z=19) và đặt 2 ván làm cầu (Z=29); E bật tời (Z=46); E bật phà (Z=65).
- Q khi đứng gần van địch: đẩy lùi van (cooldown 8 giây). Đội tới đích trước thắng.
- Chế độ DEMO OFFLINE không cần Firebase, có các NPC giả lập để bạn xem thế giới 3D. **NPC không phải multiplayer online**.
- Chế độ ONLINE sử dụng Firebase anonymous auth và Realtime Database (players, vans, stages, winner). Mỗi máy có thể mở cùng link và nhập cùng mã phòng.

## 1. Thử ngay không cần Firebase

Do browser thường chặn ES modules khi mở file qua `file://`, hãy chạy server local:

```bash
cd van-rivals-prototype
python -m http.server 8000
```

Vào `http://localhost:8000` rồi nhấn **CHƠI THỬ OFFLINE**. Có thể dùng VS Code Live Server thay thế.

## 2. Bật multiplayer ONLINE với Firebase

1. Truy cập https://console.firebase.google.com/ → **Add project** (tạo dự án Firebase).
2. Chọn **Build → Authentication → Sign-in method** và bật **Anonymous**.
3. Chọn **Build → Realtime Database → Create database**, chọn khu vực phù hợp, tạo database. Lưu ý: cần **Realtime Database**, không phải Cloud Firestore.
4. Trong Realtime Database → **Rules**, copy nội dung file `database.rules.json`, sau đó **Publish**. **Cảnh báo: đây là rules chỉ dành cho nhóm test thân quen, mọi người đã đăng nhập anonymous có thể xem/ghi dữ liệu tất cả các phòng; không dùng để phát hành công khai!** Cần thay bằng rules phân quyền chặt và backend đáng tin cậy khi phát hành thật.
5. Trong Firebase Project settings (⚙️) → **Your apps** → thêm **Web app**. Copy các trường `apiKey`, `authDomain`, `databaseURL`, `projectId`, `appId` vào `firebase-config.js`. `databaseURL` lấy từ trang Realtime Database (ví dụ `https://my-project-default-rtdb.asia-southeast1.firebasedatabase.app`). Các khóa Web config không phải private key, nhưng hãy bảo vệ dữ liệu bằng rules.
6. Vào **Authentication → Settings → Authorized domains**, nếu cần, thêm domain GitHub Pages của bạn `TEN_USER.github.io` (tùy cấu hình Auth và Firebase console).
7. Refresh trang, điền mã phòng giống nhau (ví dụ `TEST01`), từng người nhấn **VÀO PHÒNG ONLINE**. Nếu có 6 người, thứ tự đội sẽ là A, B, A, B, A, B.

**Lưu ý khi test**: vào phòng lại bằng cùng trình duyệt/cùng Firebase anonymous user sẽ giữ đội hiện tại, cho tới khi xóa dữ liệu phòng. Chia đội không cân bằng khi một người rời phòng; đó là giới hạn của prototype. Để reset, vào Realtime Database xóa `/rooms/TEST01`, hoặc chọn mã phòng mới. Các phòng không tự hết hạn. Không nên mở rộng số người hay traffic quá nhiều khi dùng database rules demo.

## 3. Đưa lên GitHub Pages

1. Tạo GitHub repository mới, ví dụ `van-rivals` (nếu dùng GitHub Pages miễn phí trên repo public, người khác sẽ thấy source code).
2. Upload **tất cả** file ở thư mục này vào root của repository: `index.html`, `game.js`, `firebase-config.js`, `database.rules.json`, `.nojekyll`, `README.md`.
3. Vào **Settings → Pages → Build and deployment → Deploy from a branch**, chọn `main`, folder `/(root)` → Save.
4. Truy cập `https://TEN_USER.github.io/van-rivals/` sau khi GitHub hoàn tất deploy.
5. Gửi **cùng link và mã phòng** cho 5–6 người. Không cần cài Unity hay game riêng.

**GitHub Pages chỉ host static HTML/JavaScript.** Multiplayer được đồng bộ thông qua Firebase, không phải GitHub. Trình duyệt cần có Internet để tải Three.js và Firebase CDN.

## 4. Các phím

| Phím | Chức năng |
|---|---|
| WASD / arrows | Di chuyển |
| Shift | Chạy nhanh |
| F (giữ) | Đẩy xe nếu đứng gần xe cùng đội |
| E | Nhặt ván / đặt ván / bật tời / bật phà theo vị trí |
| Q | Phá van của đội đối thủ nếu đứng gần |
| R | Reset camera (placeholder) |

## 5. Giới hạn kỹ thuật của bản thử nghiệm

- 3D đơn giản, không dùng Unity hay Unreal. Xe được điều khiển tiến dần qua các stage, **chưa phải vật lý thực (Rigidbody)**, dây kéo và phà chỉ là cơ chế bật/tắt cho thử nghiệm gameplay.
- Chưa có collision thực cho nhân vật và các vật cản. Không có animations, âm thanh, lobby chat, chức năng reset trận, reconnect production, chống cheat hoặc host authority.
- Firebase database write cho push liên tục khi giữ F, phù hợp vài người thử trong thời gian ngắn, không tối ưu kinh tế / băng thông cho người chơi lớn.
- Demo offline không phản ánh hiệu năng multiplayer thực. Chỉ online khi cài Firebase và người chơi khác kết nối.
- Security rules ví dụ dễ bị lạm dụng nếu public trên Internet, nhất thiết thay trước khi có người chơi ngoài nhóm test.

## 6. Công nghệ

- Three.js từ CDN v0.180.0
- Firebase modular Web SDK v11.10.0
- HTML/CSS/JS native, không cần npm, build tools, hosting trả tiền khi còn trong hạn mức miễn phí.

## 7. Kế hoạch version 0.2

- Bổ sung collision, hành động nhấc/đặt vật thể 3D có trạng thái, thêm lực kéo cần nhiều người, chống phá game bằng cooldown server-side.
- Chuyển game state sang server authoritative hoặc multiplayer SDK phù hợp game real-time, thay vì các transaction DB trực tiếp.
- Sửa spawn/gate để các team thực sự cần phối hợp 2–3 người mới qua được chướng ngại vật.
