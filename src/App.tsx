import { useEffect, useRef, useState } from 'react'
import { getProfile, getPosts, getIndexMeta } from './lib/store'
import { mdToHtml } from './lib/markdown'
import ChatBox from './components/ChatBox'
import Comments from './components/Comments'
import SyncButton from './components/SyncButton'
import Backdrop from './components/Backdrop'
import Portrait from './components/Portrait'
import { PostCard, SkillList, Stat, delay } from './components/Landing'
import ContactLinks from './components/Icons'
import ProfileEditor from './components/ProfileEditor'
import { apiConfigured, clearToken, getMe, loginAdmin, setToken } from './lib/api'
import { setMotion, useMotion, useReveal } from './lib/motion'
import { setLang, useLang, useT } from './lib/i18n'

type Route = { page: string; slug?: string }

function parseHash(): Route {
  const h = window.location.hash.replace(/^#\/?/, '')
  const [page, slug] = h.split('/')
  return { page: page || 'home', slug }
}

export default function App() {
  const [route, setRoute] = useState<Route>(parseHash)
  const motion = useMotion()
  // Reading the language here re-renders the whole tree on a switch.
  const lang = useLang()
  const t = useT()
  useEffect(() => {
    const onChange = () => {
      setRoute(parseHash())
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  const profile = getProfile()
  const posts = getPosts()
  useEffect(() => {
    document.title = profile.role ? `${profile.name} — ${profile.role}` : profile.name
  }, [profile.name, profile.role])

  const nav = [
    { page: 'home', href: '#/', label: t('nav.home') },
    { page: 'blog', href: '#/blog', label: t('nav.blog') },
    { page: 'chat', href: '#/chat', label: t('nav.chat') },
    { page: 'admin', href: '#/admin', label: t('nav.admin') },
  ]

  return (
    <>
      <Backdrop />
      <div className="app">
        <nav className="nav">
          <a href="#/" className="brand"><span className="brand-dot" aria-hidden="true" />{profile.name}</a>
          <div className="links">
            {nav.map((item) => (
              <a key={item.page} href={item.href} className={route.page === item.page ? 'active' : ''}>{item.label}</a>
            ))}
            <button
              className="lang-switch"
              onClick={() => setLang(lang === 'en' ? 'vi' : 'en')}
              aria-label={t('lang.switch')}
              title={t('lang.switch')}
            >
              <span className={lang === 'en' ? 'on' : ''}>EN</span>
              <span className={lang === 'vi' ? 'on' : ''}>VI</span>
            </button>
          </div>
        </nav>

        <main className={`main ${route.page === 'home' ? '' : 'narrow'}`}>
          {route.page === 'home' && <Home />}
          {route.page === 'blog' && !route.slug && <BlogList />}
          {route.page === 'blog' && route.slug && <Post slug={route.slug} />}
          {route.page === 'chat' && (
            <section className="card fade-in">
              <h1>{t('chat.title')}</h1>
              <p className="muted">{t('chat.sub', { n: posts.length })}</p>
              <ChatBox />
            </section>
          )}
          {route.page === 'admin' && <Admin />}
        </main>

        <footer className="footer muted">
          <ContactLinks profile={profile} />
          <p className="small">
            © {new Date().getFullYear()} {profile.name} ·{' '}
            <button className="link-btn" onClick={() => setMotion(!motion)} aria-pressed={motion}>
              {t('footer.motion', { state: t(motion ? 'footer.on' : 'footer.off') })}
            </button>
          </p>
        </footer>
      </div>
    </>
  )
}

// Everything on the landing page comes from src/content/profile.json (editable from
// #/admin): sections whose data is missing simply do not render.
function Home() {
  const t = useT()
  const p = getProfile()
  const posts = getPosts().filter((post) => !post.error).slice(0, 3)
  const skills = p.skills ?? []
  const stats = (p.stats ?? []).slice(0, 4)
  useReveal()

  return (
    <div className="home">
      <section className="hero">
        <div className="hero-copy">
          {p.available && (
            <span className="eyebrow" data-reveal><span className="pulse" aria-hidden="true" />{p.available}</span>
          )}
          <h1 className="hero-name" data-reveal style={delay(80)}>{p.name}</h1>
          <p className="hero-role" data-reveal style={delay(160)}>{p.role}</p>
          <p className="hero-intro" data-reveal style={delay(240)}>{p.intro}</p>
          <div className="hero-cta" data-reveal style={delay(320)}>
            <a className="btn btn-neon" href="#/chat">{t('hero.ask')} <span aria-hidden="true">→</span></a>
            <a className="btn btn-ghost" href="#/blog">{t('hero.blog')}</a>
          </div>
          <div data-reveal style={delay(400)}><ContactLinks profile={p} /></div>
        </div>
        <Portrait src={p.avatar} name={p.name} chips={skills.slice(0, 3)} />
      </section>

      {stats.length > 0 && (
        <section className="stats">
          {stats.map((stat, i) => <Stat key={stat.label} {...stat} wait={i * 110} />)}
        </section>
      )}

      {skills.length > 0 && <SkillList items={skills} />}

      {posts.length > 0 && (
        <section className="latest">
          <div className="section-head" data-reveal>
            <div>
              <p className="kicker">{t('posts.kicker')}</p>
              <h2>{t('posts.latest')}</h2>
            </div>
            <a href="#/blog">{t('posts.all')}</a>
          </div>
          <div className="grid">
            {posts.map((post, i) => <PostCard key={post.slug} post={post} wait={i * 110} />)}
          </div>
        </section>
      )}

      <section className="cta-band" data-reveal>
        <p className="kicker">{t('cta.kicker')}</p>
        <h2>{t('cta.title')}</h2>
        <p className="muted">{t('cta.body')}</p>
        <a className="btn btn-neon" href="#/chat">{t('cta.button')} <span aria-hidden="true">→</span></a>
      </section>
    </div>
  )
}

function BlogList() {
  const t = useT()
  const posts = getPosts()
  useReveal()
  return (
    <section className="fade-in">
      <p className="kicker">{t('posts.kicker')}</p>
      <h1>{t('blog.title')}</h1>
      <div className="grid">
        {posts.map((post, i) => <PostCard key={post.slug} post={post} wait={i * 80} />)}
      </div>
    </section>
  )
}

function Post({ slug }: { slug: string }) {
  // bodyRef lets the comment panel listen for selections inside the rendered
  // markdown, so readers can comment on exactly the passage they highlighted.
  const t = useT()
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const post = getPosts().find((p) => p.slug === slug)
  if (!post) return <p>{t('posts.notFound')} <a href="#/blog">{t('posts.backToBlog')}</a></p>
  return (
    <article className="fade-in" lang={post.lang}>
      <a href="#/blog">{t('posts.back')}</a>
      <h1>{post.meta.title}</h1>
      <p className="muted small">{post.meta.date} · {post.meta.tags.join(', ')}</p>
      <div className="card post-body" ref={bodyRef} dangerouslySetInnerHTML={{ __html: mdToHtml(post.body) }} />
      <Comments slug={slug} bodyRef={bodyRef} />
    </article>
  )
}

function Admin() {
  const [me, setMe] = useState<{ loading: boolean; admin: boolean; login: string | null }>({
    loading: true,
    admin: false,
    login: null,
  })
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [meta, setMeta] = useState(getIndexMeta())

  useEffect(() => {
    if (!apiConfigured()) {
      setMe({ loading: false, admin: false, login: null })
      return
    }
    let alive = true
    getMe()
      .then((result) => { if (alive) setMe({ loading: false, admin: result.admin, login: result.login }) })
      .catch((e: Error) => {
        if (!alive) return
        setMe({ loading: false, admin: false, login: null })
        setError(e.message)
      })
    return () => { alive = false }
  }, [])

  const signIn = async () => {
    if (!password) return
    setError('')
    try {
      const result = await loginAdmin(password)
      setToken(result.token)
      setPassword('')
      setMe({ loading: false, admin: true, login: result.login })
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const signOut = () => {
    clearToken()
    setMe({ loading: false, admin: false, login: null })
    setError('')
  }

  if (me.loading) {
    return (
      <section className="card fade-in">
        <h1>Admin</h1>
        <p className="muted">Checking sign-in…</p>
      </section>
    )
  }

  if (!me.admin) {
    return (
      <section className="card fade-in">
        <h1>Admin</h1>
        <p className="muted">
          Sign in with the admin password (<code>ADMIN_PASSWORD</code> on the server). The server holds the GitHub
          token itself, so the browser only ever carries a signed session token.
        </p>
        <div className="row">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void signIn()}
            placeholder="Admin password"
            aria-label="Admin password"
            autoFocus
          />
          <button onClick={signIn} disabled={!password.trim()}>Sign in</button>
        </div>
        {error && <p className="warn">⚠ {error}</p>}
        <p className="muted small">
          The session lives in this tab only and expires when its TTL passes or the server's session key changes.
        </p>
      </section>
    )
  }

  const posts = getPosts()
  return (
    <section className="fade-in">
      <div className="row">
        <h1>Admin</h1>
        <span className="muted small">
          signed in as <strong>{me.login}</strong>{' '}
          <button className="link-btn" onClick={signOut}>sign out</button>
        </span>
      </div>

      <div className="card">
        <h3>Blog posts</h3>
        <p className="muted small">
          Posts live in <code>src/content/*.md</code> in the git repo. Add, edit or delete a file and push — the
          next deploy bundles it and the RAG index picks it up. This panel deliberately does not write posts.
        </p>
        {posts.map((post) => (
          <div key={post.slug} className="row">
            <span>{post.slug} — {post.meta.title}</span>
            <a className="muted small" href={`#/blog/${post.slug}`}>view</a>
          </div>
        ))}
      </div>

      <ProfileEditor />

      <div className="card">
        <h3>RAG index</h3>
        <SyncButton onSync={setMeta} />
        <p className="muted small">
          Last sync: {meta.syncedAt ? new Date(meta.syncedAt).toLocaleString() : 'never'} · {meta.chunkCount} chunks · {meta.postCount} posts.
          The index is built from the deployed bundle, so profile or post changes only land here after a redeploy.
        </p>
      </div>
    </section>
  )
}
