// The cinematic scene behind every page: one fixed, static element whose look lives
// entirely in styles.css (.backdrop). It is deliberately not animated: see the note
// there for why per-frame motion behind the page was removed.
export default function Backdrop() {
  return <div className="backdrop" aria-hidden="true" />
}
