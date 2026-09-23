import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// ponytail: base './' keeps asset paths working on GitHub Pages project sites.
export default defineConfig({
  plugins: [react()],
  base: './',
})
