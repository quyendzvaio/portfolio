# PRD.md — Portfolio cá nhân + Blog AI + Chat RAG

## 1. Tổng quan
Portfolio của owner: frontend tĩnh, nội dung blog AI dạng `.md` trong git, khách đọc + thảo luận theo từng bài, chat AI trả lời dựa trên thông tin portfolio và blog. Kèm 1 backend Node nhỏ lo comment (lưu MinIO), đăng nhập admin (GitHub personal access token) + commit profile, và proxy gọi LLM. Ngôn ngữ nội dung: tiếng Anh (kèm mẫu).

## 2. Người dùng
- Visitor: xem intro, liên hệ, đọc blog, thảo luận, hỏi chat AI.
- Owner (admin): đăng nhập bằng personal access token của GitHub, sửa thông tin cá nhân (tên, avatar, link…) và commit thẳng vào git, xoá comment, bấm Sync để RAG cập nhật, thêm/sửa/xóa bài bằng cách sửa `.md` và push.

## 3. Tính năng (P0 bắt buộc / P1 nice-to-have)
- P0-1 Home: intro, avatar, LinkedIn, phone, gmail, links — đọc từ `profile.json`, sửa 1 file là đổi cả site.
- P0-2 Blog: list + đọc bài từ `.md` (frontmatter `title/date/tags/summary`), thêm/sửa/xóa bằng file hoặc trang Admin.
- P0-3 Chat RAG: hỏi thông tin portfolio/blog, trả lời kèm citation; không key → retrieval-only; có key → OpenRouter grounded, từ chối ngoài phạm vi.
- P0-4 Sync: sau mỗi lần owner update (file hoặc Admin upload), 1 nút Sync rebuild index để chat dùng ngay.
- P0-5 Thảo luận realtime theo bài: comment tự host lưu trên MinIO, khách ẩn danh (tên tuỳ chọn), cập nhật realtime qua SSE, admin xoá được từng comment. Thay Giscus vì Giscus không cho xoá comment ngay trong UI portfolio.
- P1-1 Animation mượt toàn site; hero 3D nhẹ, lazy-load, tắt được.
- P1-2 Deploy 1 chạm ra GitHub Pages.

## 4. Yêu cầu chức năng chi tiết
- FR-1 `profile.json` là nguồn duy nhất cho P0-1; Admin sửa trực tiếp rồi commit file đó vào git qua GitHub Contents API; avatar upload lên MinIO và profile tham chiếu bằng URL. Mọi field được lọc lại ở server (chỉ http/https/mailto/tel) vì giá trị này chảy vào href/src của site.
- FR-2 Mỗi `.md` có frontmatter hợp lệ; slug từ tên file; bài lỗi frontmatter bị bỏ qua kèm cảnh báo ở Admin.
- FR-3 RAG parent-child: parent = section markdown (tách theo heading, tối đa ~300 từ), child = cửa sổ ~60 từ/overlap 15; retrieve chấm child → gom best-score theo parent → rerank top-3 parent; mọi câu trả lời AI liệt kê nguồn (tiêu đề bài/section profile).
- FR-4 Chat gọi OpenRouter bằng đúng 3 biến `.env` (baseURL, model, key do owner tự custom); lỗi key/mạng phải báo rõ, fallback retrieval-only.
- FR-5 Admin ở `#/admin`, đăng nhập bằng GitHub personal access token; owner suy ra từ `GITHUB_REPO` nên chỉ chủ repo vào được; danh sách bài là read-only (sửa bằng git); nút Sync rebuild toàn bộ + báo thời gian + số chunk.
- FR-6 Mỗi trang Post có 1 thread comment riêng theo slug, lưu trên MinIO, realtime qua SSE; khách không cần tài khoản; admin xoá được từng comment; thiếu `VITE_API_BASE_URL` thì hiện hướng dẫn setup thay vì lỗi.
- FR-7 Hash router để tương thích GitHub Pages (không rewrite server).

## 5. Phi chức năng
- Frontend tĩnh (GitHub Pages) + backend Node nhỏ chạy cạnh MinIO; `tsc --noEmit && vite build` và `npm run typecheck:server` phải xanh.
- Hiệu năng: hero 3D không chặn render đầu; Giscus lazy sau nội dung.
- Bảo mật: OpenRouter key + MinIO credentials nằm ở backend, không vào bundle client; admin xác thực bằng GitHub OAuth; comment công khai nên bị giới hạn rate theo IP và độ dài.
- A11y tối thiểu: alt avatar, contrast, focus visible, chat dùng được bằng bàn phím.

## 6. Config
- `.env` (frontend, public): `VITE_API_BASE_URL`.
- `.env.server` (backend, bí mật): `MINIO_*`, `GITHUB_REPO/BRANCH/PROFILE_PATH`, `OPENROUTER_*`, `FRONTEND_ORIGIN`, `TRUST_PROXY`.
- PAT của admin không nằm trong file env: người dùng dán vào trang `#/admin`, chỉ giữ trong sessionStorage của tab.
- Deploy: `.github/workflows/deploy.yml` build `dist/` → gh-pages.

## 7. Tiêu chí nghiệm thu
- AC-1: Sửa `profile.json` → Home đổi theo, không sửa code.
- AC-2: Thêm 1 `.md` mới + Sync → Blog list có bài, chat trích được nội dung bài.
- AC-3: Rút key → chat vẫn trả lời retrieval + citation, không crash.
- AC-4: Mỗi bài có thread riêng; comment bài A không lẫn bài B; hai browser thấy comment của nhau ngay không cần reload; admin xoá được comment ngay trong trang.
- AC-5: `npm run build && npx vite preview` pass; deploy workflow xanh.
