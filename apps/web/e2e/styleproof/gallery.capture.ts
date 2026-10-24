import { expect } from '@playwright/test';
import {
  componentCatalogSurfaces,
  defineStyleMapCapture,
  discoverComponentFiles,
} from 'styleproof';

// Each UI component must render its section in the gallery (ADR 0063).
// One viewport per media band in apps/web/src/index.css.
const COMPONENTS = discoverComponentFiles({ roots: ['packages/ui/src'] });

defineStyleMapCapture({
  dir: process.env.STYLEMAP_DIR,
  surfaces: componentCatalogSurfaces(COMPONENTS, {
    url: (component) => `/?component=${component.key}`,
    widths: [1280, 390],
  }).map((surface) => ({
    ...surface,
    go: async (page) => {
      await surface.go(page);
      await expect(page.locator(`[data-component="${surface.key}"]`)).toBeVisible();
    },
  })),
  expected: COMPONENTS.map((component) => component.key),
});
