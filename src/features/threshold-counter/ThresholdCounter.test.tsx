import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThresholdCounter } from './ThresholdCounter';

/**
 * Tests assert on observable behaviour through the accessibility tree (roles,
 * names, the live status region) — never on implementation detail. This mirrors
 * the philosophy in `.claude/skills/write-unit-tests/SKILL.md`.
 */
describe('ThresholdCounter', () => {
  it('starts healthy at zero', () => {
    render(<ThresholdCounter />);

    expect(screen.getByTestId('count')).toHaveTextContent('0');
    expect(screen.getByRole('status')).toHaveTextContent('Healthy');
  });

  it('warns as it approaches the limit, then reports capacity at the threshold', async () => {
    const user = userEvent.setup();
    render(<ThresholdCounter />);
    const increase = screen.getByRole('button', { name: /increase/i });

    for (let i = 0; i < 4; i += 1) {
      await user.click(increase);
    }
    expect(screen.getByRole('status')).toHaveTextContent('Approaching limit');

    for (let i = 0; i < 4; i += 1) {
      await user.click(increase);
    }
    expect(screen.getByRole('status')).toHaveTextContent('At capacity');
  });

  it('never decrements below zero and can be reset', async () => {
    const user = userEvent.setup();
    render(<ThresholdCounter />);
    const decrease = screen.getByRole('button', { name: /decrease/i });
    const increase = screen.getByRole('button', { name: /increase/i });
    const reset = screen.getByRole('button', { name: /reset/i });

    await user.click(decrease);
    expect(screen.getByTestId('count')).toHaveTextContent('0');

    await user.click(increase);
    await user.click(increase);
    expect(screen.getByTestId('count')).toHaveTextContent('2');

    await user.click(reset);
    expect(screen.getByTestId('count')).toHaveTextContent('0');
    expect(screen.getByRole('status')).toHaveTextContent('Healthy');
  });
});
