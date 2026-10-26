// Vercel entry: every /api/* request runs the same listener the Docker server uses.
// `npm run build:server` (vercel.json buildCommand) compiles server/dist first.
export { listener as default } from '../server/dist/index.js'
