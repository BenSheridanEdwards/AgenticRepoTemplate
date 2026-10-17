import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The web app reaches its api at /trpc. The dev and preview servers proxy that
// path to the api process, which `pnpm dev` and Playwright start beside Vite.
const proxy = { '/trpc': process.env.API_ORIGIN ?? 'http://127.0.0.1:3001' };

// Vite is only the carrier that makes this template runnable. The agentic
// scaffolding (gates, context, skills) is stack-agnostic — see README.md.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy },
  preview: { port: 3000, proxy },
});
