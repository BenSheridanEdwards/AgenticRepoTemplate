import { defineConfig } from 'styleproof';

// Gallery-only StyleProof (ADR 0063). Route traversal stays a future direction.
export default defineConfig({
  spec: 'apps/web/e2e/styleproof/gallery.capture.ts',
});
