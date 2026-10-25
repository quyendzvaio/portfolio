import { useEffect, useRef, useState } from 'react'
import { getProfile, getPosts, getIndexMeta } from './lib/store'
import { mdToHtml } from './lib/markdown'
import ChatBox from './components/ChatBox'
import Comments from './components/Comments'
import SyncButton from './components/SyncButton'
import Hero3D from './components/Hero3D'
import ContactLinks from './components/Icons'
import ProfileEditor from './components/ProfileEditor'
import { apiConfigured, clearToken, getMe, loginAdmin, setToken } from './lib/api'

type Route = { page: string; slug?: string }

function parseHash(): Route {
  const h = window.location.hash.replace(/^#\/?/, '')
  const [page, slug] = h.split('/')
  return { page: page || 'home', slug }
}

export default function App() {
  const [route, setRoute] = useState<Route>(parseHash)
  useEffect(() => {
    const onChange = () => setRoute(parseHash())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  const profile = getProfile()
  const posts = getPosts()

  return (
    <div className="app">
      <nav className="nav">
        <a href="#/" className="brand">{profile.name}</a>
        <div className="links">
          <a href="#/" className={route.page === 'home' ? 'active' : ''}>Home</a>
          <a href="#/blog" className={route.page === 'blog' ? 'active' : ''}>Blog</a>
          <a href="#/chat" className={route.page === 'chat' ? 'active' : ''}>Ask AI</a>
          <a href="#/admin" className={route.page === 'admin' ? 'active' : ''}>Admin</a>
        </div>
      </nav>

      <main className="main">
        {route.page === 'home' && <Home />}
        {route.page === 'blog' && !route.slug && <BlogList />}
        {route.page === 'blog' && route.slug && <Post slug={route.slug} />}
        {route.page === 'chat' && (
          <section className="card fade-in">
            <h1>Ask about this portfolio</h1>
            <p className="muted">Grounded in profile + {posts.length} blog post(s). Answers cite their sources.</p>
            <ChatBox />
          </section>
        )}
        {route.page === 'admin' && <Admin />}
      </main>

      <footer className="footer muted">
        <ContactLinks profile={profile} />
        <p className="small">{profile.name}</p>
      </footer>
    </div>
  )
}

function Home() {
  const p = getProfile()
  const posts = getPosts().slice(0, 3)
  return (
    <>
      <section className="hero card fade-in">
        <Hero3D />
        <div className="hero-body">
          <img className="avatar" src={p.avatar} alt={`${p.name} avatar`} />
          <div>
            <h1>{p.name}</h1>
            <p className="role">{p.role}</p>
            <p>{p.intro}</p>
            <ContactLinks profile={p} />
          </div>
        </div>
      </section>
      <section className="fade-in">
        <h2>Latest posts</h2>
        <div className="grid">
          {posts.map((post) => (
            <a key={post.slug} className="card post-card" href={`#/blog/${post.slug}`}>
              <h3>{post.meta.title}</h3>
              <p className="muted small">{post.meta.date} · {post.meta.tags.join(', ')}</p>
              <p>{post.meta.summary}</p>
            </a>
          ))}
        </div>
      </section>
    </>
  )
}

function BlogList() {
  const posts = getPosts()
  return (
    <section className="fade-in">
      <h1>Blog</h1>
      <div className="grid">
        {posts.map((post) => (
          <a key={post.slug} className="card post-card" href={`#/blog/${post.slug}`}>
            <h3>{post.meta.title}</h3>
            <p className="muted small">{post.meta.date} · {post.meta.tags.join(', ')}</p>
            <p>{post.meta.summary}</p>
            {post.error && <p className="warn">⚠ {post.error}</p>}
          </a>
        ))}
      </div>
    </section>
  )
}

function Post({ slug }: { slug: string }) {
  // bodyRef lets the comment panel listen for selections inside the rendered
  // markdown, so readers can comment on exactly the passage they highlighted.
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const post = getPosts().find((p) => p.slug === slug)
  if (!post) return <p>Post not found. <a href="#/blog">Back to blog</a></p>
  return (
    <article className="fade-in">
      <a href="#/blog">← Blog</a>
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
