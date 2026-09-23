/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the comments/auth/chat backend. When empty, those features are off. */
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
