# plan.md — Kế hoạch thực hiện portfolio

Nguồn: `/home/quyen/.claude/plans/t-o-m-t-portfolio-cho-delegated-naur.md`.
Yêu cầu gốc: portfolio dễ custom (introduce, avatar, LinkedIn, phone, gmail), blog bằng thêm/sửa/xóa file `.md`, chat AI theo RAG trả lời trực tiếp thông tin portfolio + blog (nút Sync mỗi khi owner update), animation mượt + 3D nhẹ, kênh đóng góp realtime theo từng blog (chốt: Giscus).

## 1. Stack (chốt)
- Vite + React + TS, hash router (`#/`, `#/blog`, `#/blog/:slug`, `#/chat`, `#/admin`).
- Deploy GitHub Pages tĩnh qua `.github/workflows/deploy.yml` (build `dist/` → gh-pages).
- Chat AI: OpenRouter qua `fetch` chat-completions, 3 biến `.env`: `VITE_OPENROUTER_BASE_URL`, `VITE_OPENROUTER_MODEL`, `VITE_OPENROUTER_API_KEY`.
- RAG client-side: chunk + TF-IDF/keyword + rerank + citation; HyDE-lite khi có key.
- Comment realtime: Giscus (GitHub Discussions), config trong `profile.json`.
- Motion: framer-motion + CSS; 3D hero lazy-load (react-three-fiber), có toggle tắt.

## 2. Cấu trúc file (tối thiểu)
- `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`
- `src/content/profile.json` — 1 điểm sửa: intro, avatar, linkedin, phone, gmail, links, giscus
- `src/content/*.md` — 3 bài mẫu tiếng Anh, frontmatter `title/date/tags/summary`
- `src/lib/markdown.ts` — parse frontmatter + render md
- `src/lib/rag.ts` — parent-child chunking (parent = section theo heading ~300 từ, child ~60 từ/overlap 15), retrieve chấm child → top-k parent, hybrid score (TF-IDF + keyword boost + recency), rerank top-3 + citations
- `src/lib/chat.ts` — gọi OpenRouter, system prompt giới hạn phạm vi portfolio/blog
- `src/lib/store.ts` — localStorage overlay (profile edit, md add/edit/delete, index cache), logic Sync
- `src/pages/{Home,Blog,Post,Chat,Admin}.tsx`, `src/components/{Hero3D,ChatBox,SyncButton,Comments}.tsx`
- `.env.example`, `.github/workflows/deploy.yml`
- Comment `ponytail:` cho các đơn giản hóa cố ý (key lộ ở client, TF-IDF thay vector DB, localStorage thay CMS).

## 3. Thứ tự làm
1. Scaffold Vite + router + layout + `profile.json` + 3 `.md` mẫu → chạy `dev` thấy home/blog.
2. `markdown.ts` + trang Post + `Comments.tsx` (Giscus theo pathname, lazy, sync theme).
3. `rag.ts` + `ChatBox` (chưa key: trả lời retrieval-only kèm citation).
4. `chat.ts` (OpenRouter) + system prompt giới hạn phạm vi.
5. `store.ts` + trang Admin (token gate): upload/sửa/xóa `.md`, auto re-index, nút Sync, export.
6. Motion + Hero3D + toggle; `.env.example` + workflow deploy; build + preview.

## 4. Ràng buộc đã biết
- GitHub Pages tĩnh → key OpenRouter trong bundle client, visitor thấy được. Chấp nhận ở bản đầu; khi cần thì thêm proxy (Vercel/Cloudflare worker).
- Giscus yêu cầu owner: bật Discussions cho repo, lấy 4 giá trị tại giscus.app điền vào `profile.json.giscus`.

## 5. Verify
1. `npm run dev`: home/blog/post/chat hiển thị đúng profile + 3 bài mẫu.
2. Chat không key → đáp án retrieval + citation; có key → đáp án OpenRouter grounded.
3. Admin upload/sửa/xóa `.md` → auto re-index; Sync rebuild; chat trả lời nội dung mới.
4. `npm run build && npx vite preview` pass; deploy workflow pushes `dist/` to gh-pages.

## 6. Không làm / làm khi nào
- Vector DB/embeddings API — khi blog nhiều hoặc chất lượng retrieval kém.
- Proxy giấu key — khi lo abuse key.
- 3D toàn site — khi còn ngân sách perf (hiện chỉ hero).
