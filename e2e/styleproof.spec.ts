import { defineStyleMapCapture } from 'styleproof';

/**
 * StyleProof reads the browser's *computed* styles for each surface and diffs
 * the PR head against its base branch — catching CSS regressions that pixel
 * snapshots miss (forced :hover/:focus, between-breakpoint rules, sub-pixel
 * drift). It is inert until STYLEMAP_DIR is set, so it lives safely beside the
 * behaviour specs and only runs inside `.github/workflows/styleproof.yml`.
 */
defineStyleMapCapture({
  dir: process.env.STYLEMAP_DIR,
  surfaces: [
    {
      key: 'threshold-counter',
      go: async (page) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');
      },
      // One viewport per @media band declared in src/index.css.
      widths: [1280, 768, 390],
    },
  ],
});
