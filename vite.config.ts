import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { personalGraphApi } from './vite-plugin-personal-graph.ts'

// GitHub Pages project site: https://<user>.github.io/BJJ_Automata/
// Override with VITE_BASE_PATH=/ for other hosts.
const base = process.env.VITE_BASE_PATH || '/'

export default defineConfig({
  base,
  plugins: [react(), personalGraphApi()],
})
