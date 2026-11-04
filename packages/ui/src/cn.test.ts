import { cn } from './cn';

it('merges complete conditional classes and lets the caller override a default', () => {
  expect(cn('p-2 bg-surface', false, undefined, null, 'p-4')).toBe('bg-surface p-4');
  expect(cn('border border-line text-base text-ink', 'hover:bg-raised')).toBe(
    'border border-line text-base text-ink hover:bg-raised',
  );
});
