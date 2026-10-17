import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import { ThresholdCounter } from './ThresholdCounter';

// Accessibility is a correctness concern here, not a polish task. jest-axe
// catches structural/ARIA violations at the unit level; the real-browser scan
// in e2e/accessibility.spec.ts adds what jsdom cannot compute (colour contrast).
it('has no axe-detectable accessibility violations', async () => {
  const { container } = render(<ThresholdCounter />);

  expect(await axe(container)).toHaveNoViolations();
});
