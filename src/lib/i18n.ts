import { useEffect, useState } from 'react'

// The site's language switch. English is the default; the choice is kept per browser
// and mirrored on <html lang> so screen readers and hyphenation follow it. Posts and
// the profile pick their Vietnamese text from the content files (see store.ts); this
// file holds only the interface strings.
export type Lang = 'en' | 'vi'
export const LANGS: Lang[] = ['en', 'vi']
const KEY = 'portfolio.lang'

function initial(): Lang {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'en' || saved === 'vi') return saved
  } catch { /* storage blocked: default */ }
  return 'en'
}

let current = initial()
const listeners = new Set<(lang: Lang) => void>()
document.documentElement.lang = current

export function getLang(): Lang {
  return current
}

export function setLang(lang: Lang): void {
  current = lang
  document.documentElement.lang = lang
  try { localStorage.setItem(KEY, lang) } catch { /* per-visit only */ }
  listeners.forEach((listener) => listener(lang))
}

export function useLang(): Lang {
  const [lang, set] = useState(current)
  useEffect(() => {
    listeners.add(set)
    return () => { listeners.delete(set) }
  }, [])
  return lang
}

const en = {
  'nav.home': 'Home',
  'nav.blog': 'Blog',
  'nav.admin': 'Admin',
  'lang.switch': 'Đọc bằng tiếng Việt',
  'hero.ask': 'Ask AI about the blog',
  'hero.blog': 'Read the blog',
  'skills.kicker': 'Toolkit',
  'skills.title': 'Skills',
  'posts.kicker': 'Writing',
  'posts.latest': 'Latest posts',
  'posts.all': 'All posts →',
  'posts.read': 'Read post',
  'posts.back': '← Blog',
  'posts.notFound': 'Post not found.',
  'posts.backToBlog': 'Back to blog',
  'blog.title': 'Blog',
  'cta.kicker': "Ask, don't scroll",
  'cta.title': 'Questions about a post?',
  'cta.body': 'Open the chat on the blog. It answers from the posts and tells you which one each answer comes from.',
  'cta.button': 'Ask the blog',
  'chat.title': 'Ask the blog',
  'chat.open': 'Ask AI about the blog',
  'chat.close': 'Close chat',
  'chat.sub': 'Answers come from the {n} posts and name the post they used.',
  'chat.placeholder': 'Ask about RAG, LangChain, LangGraph, MCP…',
  'chat.label': 'Ask about the blog',
  'chat.send': 'Send',
  'chat.noKey': 'The backend has no OpenRouter key set — running in retrieval-only mode.',
  'chat.sync': 'Sync index',
  'chat.synced': 'Index synced. Ask again.',
  'chat.error': 'Chat error: {msg}. Showing retrieval instead.',
  'chat.notFound': 'I couldn\'t find anything about "{q}" in the blog posts. Try a topic they cover: RAG, LangChain, LangGraph, AI agents, MCP or harness engineering.',
  'chat.basedOn': 'From the blog:',
  'chat.sources': 'Sources:',
  'chat.raw': '(Set an OpenRouter API key for fluent answers — this is raw retrieval.)',
  'footer.motion': 'motion {state}',
  'footer.on': 'on',
  'footer.off': 'off',
  'c.title': 'Discuss this post',
  'c.off': 'Comments are off in this build.',
  'c.liveOn': 'Auto-refreshing while this thread is on screen',
  'c.liveOff': 'Auto-refresh paused',
  'c.live': 'live',
  'c.offline': 'offline',
  'c.tip': 'Tip: select any paragraph in the post to comment on exactly that passage.',
  'c.loading': 'Loading comments…',
  'c.empty': 'No comments yet — be the first.',
  'c.name': 'Your name (optional)',
  'c.nameLabel': 'Your name',
  'c.onSelection': 'Comment on this selection…',
  'c.onSelectionLabel': 'Comment on selection',
  'c.posting': 'Posting…',
  'c.comment': 'Comment',
  'c.cancel': 'cancel',
  'c.replyingTo': 'Replying to',
  'c.cancelReply': 'cancel reply',
  'c.replyTo': 'Reply to {name}…',
  'c.add': 'Add a comment… no account needed',
  'c.bodyLabel': 'Comment body',
  'c.postReply': 'Post reply',
  'c.post': 'Post comment',
  'c.hint': 'Ctrl/⌘ + Enter to post · stored in Blob storage',
  'c.confirmDelete': 'Delete the comment from {name}?',
  'c.delete': 'delete',
  'c.deleteTitle': 'Delete this comment',
  'c.actions': 'Comment actions',
  'c.reply': '↩ Reply',
  'c.react': 'React {kind}',
  'c.unreact': 'Remove your {kind}',
}

type Key = keyof typeof en

const vi: Record<Key, string> = {
  'nav.home': 'Trang chủ',
  'nav.blog': 'Blog',
  'nav.admin': 'Admin',
  'lang.switch': 'Read in English',
  'hero.ask': 'Hỏi AI về blog',
  'hero.blog': 'Đọc blog',
  'skills.kicker': 'Công cụ',
  'skills.title': 'Kỹ năng',
  'posts.kicker': 'Bài viết',
  'posts.latest': 'Bài viết mới',
  'posts.all': 'Tất cả bài viết →',
  'posts.read': 'Đọc bài',
  'posts.back': '← Blog',
  'posts.notFound': 'Không tìm thấy bài viết.',
  'posts.backToBlog': 'Quay lại blog',
  'blog.title': 'Blog',
  'cta.kicker': 'Hỏi thay vì cuộn',
  'cta.title': 'Có câu hỏi về bài viết?',
  'cta.body': 'Mở khung chat trong blog. AI trả lời từ nội dung các bài viết và cho biết câu trả lời lấy từ bài nào.',
  'cta.button': 'Hỏi về blog',
  'chat.title': 'Hỏi đáp về blog',
  'chat.open': 'Hỏi AI về blog',
  'chat.close': 'Đóng chat',
  'chat.sub': 'Trả lời dựa trên {n} bài viết và ghi rõ lấy từ bài nào.',
  'chat.placeholder': 'Hỏi về RAG, LangChain, LangGraph, MCP…',
  'chat.label': 'Hỏi về blog',
  'chat.send': 'Gửi',
  'chat.noKey': 'Backend chưa có key OpenRouter — đang chạy ở chế độ chỉ tìm kiếm.',
  'chat.sync': 'Đồng bộ chỉ mục',
  'chat.synced': 'Đã đồng bộ chỉ mục. Hãy hỏi lại.',
  'chat.error': 'Lỗi chat: {msg}. Hiển thị kết quả tìm kiếm thay thế.',
  'chat.notFound': 'Mình không tìm thấy gì về "{q}" trong các bài blog. Thử hỏi một chủ đề blog có viết: RAG, LangChain, LangGraph, AI agent, MCP hay harness engineering.',
  'chat.basedOn': 'Từ các bài blog:',
  'chat.sources': 'Nguồn:',
  'chat.raw': '(Đây là kết quả tìm kiếm thô — cần key OpenRouter để có câu trả lời trôi chảy.)',
  'footer.motion': 'hiệu ứng {state}',
  'footer.on': 'bật',
  'footer.off': 'tắt',
  'c.title': 'Thảo luận',
  'c.off': 'Bình luận đang tắt ở bản build này.',
  'c.liveOn': 'Tự cập nhật khi khung bình luận đang hiện',
  'c.liveOff': 'Tạm dừng tự cập nhật',
  'c.live': 'trực tiếp',
  'c.offline': 'ngoại tuyến',
  'c.tip': 'Mẹo: bôi đen một đoạn trong bài để bình luận đúng đoạn đó.',
  'c.loading': 'Đang tải bình luận…',
  'c.empty': 'Chưa có bình luận nào — hãy là người đầu tiên.',
  'c.name': 'Tên của bạn (không bắt buộc)',
  'c.nameLabel': 'Tên của bạn',
  'c.onSelection': 'Bình luận về đoạn này…',
  'c.onSelectionLabel': 'Bình luận về đoạn đã chọn',
  'c.posting': 'Đang gửi…',
  'c.comment': 'Bình luận',
  'c.cancel': 'huỷ',
  'c.replyingTo': 'Đang trả lời',
  'c.cancelReply': 'huỷ trả lời',
  'c.replyTo': 'Trả lời {name}…',
  'c.add': 'Viết bình luận… không cần tài khoản',
  'c.bodyLabel': 'Nội dung bình luận',
  'c.postReply': 'Gửi trả lời',
  'c.post': 'Gửi bình luận',
  'c.hint': 'Ctrl/⌘ + Enter để gửi · lưu trên Blob storage',
  'c.confirmDelete': 'Xoá bình luận của {name}?',
  'c.delete': 'xoá',
  'c.deleteTitle': 'Xoá bình luận này',
  'c.actions': 'Thao tác bình luận',
  'c.reply': '↩ Trả lời',
  'c.react': 'Thả {kind}',
  'c.unreact': 'Bỏ {kind}',
}

const STRINGS: Record<Lang, Record<Key, string>> = { en, vi }

export function t(key: Key, vars: Record<string, string | number> = {}, lang: Lang = current): string {
  return STRINGS[lang][key].replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole))
}

/** `t` bound to the current language; the calling component re-renders on a switch. */
export function useT(): typeof t {
  const lang = useLang()
  return (key, vars = {}) => t(key, vars, lang)
}
