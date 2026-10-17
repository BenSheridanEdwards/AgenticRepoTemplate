import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Vite is only the carrier that makes this template runnable. The agentic
// scaffolding (gates, context, skills) is stack-agnostic — see README.md.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  preview: { port: 3000 },
});
