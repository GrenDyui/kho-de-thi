# EduVault - Nền Tảng Kho Đề Thi & Ôn Luyện Mở (100% Ẩn Danh)

Nền tảng chia sẻ đề thi, làm bài trắc nghiệm trực tuyến, xem lời giải chi tiết và tải đề thi hoàn toàn miễn phí.  
Được thiết kế theo kiến trúc **Static Web (100% Client-Side)**, không cần cài đặt Node.js hay môi trường backend phức tạp. Bạn chỉ cần tải các file này lên GitHub Repository và bật GitHub Pages là trang web sẽ hoạt động ngay lập tức!

---

## 🌟 Tính Năng Chính

* 📑 **Xem Đề Trực Tuyến & In Ấn Chuẩn A4**: Đề thi được trình bày sạch sẽ, không chứa thông tin hành chính thừa. Hỗ trợ in đề (Print / Save PDF) với chuẩn trang in tối ưu.
* ⏱️ **Chế Độ Thi Thử (Timed Mock Exam)**:
  * Đồng hồ đếm ngược theo thời gian thực.
  * Bảng điều hướng câu hỏi (Palette) trực quan: Đánh dấu câu đã làm, chưa làm, hoặc phân vân.
  * Tự động nộp bài khi hết giờ và chấm điểm theo thang điểm 10.
  * Bảng phân tích chi tiết: Điểm số, độ chính xác (%), câu đúng/sai kèm lời giải.
* ⚡ **Chế Độ Ôn Tập (Practice Mode)**: Chọn đáp án biết ngay kết quả Đúng/Sai tức thì, mở ngay lời giải để ôn luyện không áp lực.
* 🔢 **Hỗ Trợ Công Thức Toán/Lý/Hóa (KaTeX)**: Hiển thị mượt mà các ký hiệu tích phân, phân số, ma trận, phương trình hóa học.
* 🔍 **Tìm Kiếm & Bộ Lọc Nhanh**: Lọc theo Môn học (Toán, Lý, Hóa, Sinh, Tiếng Anh,...) và Khối lớp (Lớp 10, 11, 12, ĐGNL).
* 📥 **Tải Đề Thi Đa Định Dạng**: Tải về dưới dạng `.txt` (văn bản) hoặc `.json`.
* ➕ **Công Cụ "Nhập Đề Nhanh"**: Cho phép dán mã JSON hoặc nạp file JSON trực tiếp trên giao diện web để trải nghiệm đề mới ngay tức thì.
* 🌓 **Giao Diện Sáng / Tối (Dark Mode)**: Tự động lưu lựa chọn của người dùng.

---

## 🚀 Hướng Dẫn Đưa Lên GitHub Pages (Chỉ 3 Bước)

### Bước 1: Tạo Repository mới trên GitHub
1. Đăng nhập vào GitHub và tạo một Repository mới (ví dụ đặt tên là `de-thi` hoặc `eduvault`).
2. Chọn chế độ **Public**.

### Bước 2: Tải toàn bộ file trong thư mục này lên Repo
Các file cần có trên Repo:
```text
├── index.html
├── style.css
├── app.js
├── .nojekyll
├── README.md
└── data/
    └── exams.json
```
*(Bạn có thể dùng lệnh `git push` hoặc kéo thả trực tiếp qua giao diện web của GitHub).*

### Bước 3: Bật GitHub Pages
1. Tại trang Repository trên GitHub, vào tab **Settings** (Cài đặt) -> chọn mục **Pages** ở thanh bên trái.
2. Tại mục **Build and deployment**:
   * **Source**: Chọn `Deploy from a branch`.
   * **Branch**: Chọn `main` (hoặc `master`) và thư mục là `/ (root)`.
3. Bấm **Save**.
4. Chờ khoảng 30-60 giây, GitHub sẽ cung cấp cho bạn một đường link website (dạng `https://<ten-user>.github.io/<ten-repo>/`). Truy cập vào là dùng được ngay!

---

## 📝 Cách Thêm Đề Thi Mới

Khi bạn gửi ảnh hoặc file tài liệu đề thi cho tôi (AI):
1. Tôi sẽ quét, bóc tách chuẩn xác nội dung câu hỏi, công thức Toán/Lý/Hóa, 4 phương án và lời giải chi tiết (lọc sạch hoàn toàn các thông tin trường, sở, kỳ thi hành chính).
2. Tôi sẽ xuất ra cho bạn một khối mã JSON chuẩn.
3. Bạn có 2 cách cực kỳ nhanh để đưa đề vào web:
   * **Cách 1 (Nhanh nhất - Không cần sửa code)**: Mở trang web lên -> Bấm nút **"Nhập Đề Nhanh"** ở góc phải -> Dán mã JSON vào -> Bấm **"Nạp Đề Ngay"**.
   * **Cách 2 (Lưu vĩnh viễn trên GitHub)**: Mở file `data/exams.json` trên GitHub, dán thêm đề thi mới vào danh sách và bấm Commit.

---

## 🔒 Tính Ẩn Danh
Dự án được viết hoàn toàn độc lập, không liên kết API bên thứ ba, không thu thập dữ liệu cá nhân (Telemetry), không chứa bất kỳ tên tuổi cá nhân hay metadata của tác giả.
