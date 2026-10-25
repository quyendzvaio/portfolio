import { useCallback, useEffect, useState } from 'react'
import { getProfile, type Profile } from '../lib/store'
import { apiConfigured, getRepoProfile, saveProfile, uploadAvatar } from '../lib/api'

const MAX_AVATAR_BYTES = 2 * 1024 * 1024

// Edits profile.json in the repo through the backend. Nothing is kept in this
// browser: the file in git is what every visitor sees, so a save here shows up on
// the live site once GitHub Actions finishes redeploying.
export default function ProfileEditor() {
  const [form, setForm] = useState<Profile>(() => getProfile())
  const [baseline, setBaseline] = useState<Profile>(() => getProfile())
  const [fromRepo, setFromRepo] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  const set = (k: keyof Profile, v: string) => setForm((p) => ({ ...p, [k]: v }))

  const load = useCallback(async () => {
    if (!apiConfigured()) {
      setLoading(false)
      return
    }
    try {
      const { profile } = await getRepoProfile()
      const merged = { ...getProfile(), ...profile }
      setForm(merged)
      setBaseline(merged)
      setFromRepo(true)
      setError('')
    } catch (e) {
      // Not fatal: the deployed copy still makes a usable form, and the error text
      // explains why the values might be behind the repo.
      setError(`${(e as Error).message} Showing the last deployed copy instead.`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const dirty = JSON.stringify(form) !== JSON.stringify(baseline)

  const onAvatarFile = async (file: File) => {
    // Checked here as well as on the server so a too-large file fails instantly
    // instead of after pushing megabytes over the wire.
    if (file.size > MAX_AVATAR_BYTES) {
      setError(`${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 2 MB.`)
      return
    }
    setUploading(true)
    setError('')
    try {
      const { url } = await uploadAvatar(file)
      setForm((p) => ({ ...p, avatar: url }))
      setStatus('Avatar uploaded to Blob storage. Save to commit it into profile.json.')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  const save = async () => {
    setSaving(true)
    setError('')
    setStatus('')
    try {
      const result = await saveProfile(form)
      // Show what was committed, not what was typed: the server drops disallowed links
      // and trims fields, and the form must not claim those survived.
      const saved = { ...getProfile(), ...result.profile }
      const cleaned = JSON.stringify(saved) !== JSON.stringify(form)
      setForm(saved)
      setBaseline(saved)
      setFromRepo(true)
      setStatus(
        `Committed to ${result.path}. GitHub Actions redeploys in about a minute — the live site updates then.` +
          (cleaned ? ' Some values were cleaned up on save; the form now shows what was committed.' : ''),
      )
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card">
      <div className="row">
        <h3>Profile</h3>
        <span className="muted small">
          {fromRepo ? 'editing the committed profile.json' : 'editing the last deployed copy'}
          {dirty && ' · unsaved changes'}
        </span>
      </div>
      <p className="muted small">
        Saves commit <code>src/content/profile.json</code> to the repo. Wait for the deploy before judging the
        result, and hard-refresh if your browser cached the old avatar.
      </p>

      {loading && <p className="muted small">Loading the committed profile…</p>}
      {error && <p className="warn small">⚠ {error}</p>}

      <div className="form-grid">
        <label>Name<input value={form.name} onChange={(e) => set('name', e.target.value)} /></label>
        <label>Role<input value={form.role} onChange={(e) => set('role', e.target.value)} /></label>
        <label>Intro<textarea rows={3} value={form.intro} onChange={(e) => set('intro', e.target.value)} /></label>

        <label>Avatar URL<input value={form.avatar} onChange={(e) => set('avatar', e.target.value)} placeholder="https://…" /></label>
        <div className="row">
          {form.avatar && <img className="avatar-preview" src={form.avatar} alt="avatar preview" />}
          <label className="btn">
            {uploading ? 'Uploading…' : 'Upload avatar'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              hidden
              disabled={uploading}
              onChange={(e) => e.target.files?.[0] && void onAvatarFile(e.target.files[0])}
            />
          </label>
          <span className="muted small">PNG/JPEG/WebP/GIF, up to 2 MB → stored in Blob storage</span>
        </div>

        <label>LinkedIn<input value={form.linkedin} onChange={(e) => set('linkedin', e.target.value)} /></label>
        <label>Phone<input value={form.phone} onChange={(e) => set('phone', e.target.value)} /></label>
        <label>Gmail<input value={form.gmail} onChange={(e) => set('gmail', e.target.value)} /></label>
      </div>

      <h3>Links (shown as icons)</h3>
      {form.links.map((link, i) => (
        <div key={i} className="row">
          <input
            value={link.label}
            placeholder="Label (GitHub, LinkedIn…)"
            onChange={(e) => setForm((p) => ({ ...p, links: p.links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) }))}
          />
          <input
            value={link.url}
            placeholder="https://…"
            onChange={(e) => setForm((p) => ({ ...p, links: p.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) }))}
          />
          <button onClick={() => setForm((p) => ({ ...p, links: p.links.filter((_, j) => j !== i) }))}>Remove</button>
        </div>
      ))}
      <button onClick={() => setForm((p) => ({ ...p, links: [...p.links, { label: '', url: '' }] }))}>Add link</button>
      <p className="muted small">Only http(s), mailto: and tel: links are kept — anything else is dropped on save.</p>

      <div className="row">
        <button onClick={save} disabled={saving || loading || !dirty}>
          {saving ? 'Committing…' : 'Save to git'}
        </button>
        <button className="link-btn" onClick={() => { setForm(baseline); setStatus('') }} disabled={!dirty}>
          reset
        </button>
        <span className="muted small">{status}</span>
      </div>
    </div>
  )
}
