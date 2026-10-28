// Vercel entry: vercel.json rewrites every /api/* path here, and the request keeps its
// original URL, so the same listener the Docker server uses routes it. A catch-all
// file name (`[...path].js`) only matched one segment outside Next.js, which made
// /api/chat/status and /api/profile/avatar 404.
// `npm run build:server` (vercel.json buildCommand) compiles server/dist first.
export { listener as default } from '../server/dist/index.js'
