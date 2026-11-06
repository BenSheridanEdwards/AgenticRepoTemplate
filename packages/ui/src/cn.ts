import { extendTailwindMerge } from 'tailwind-merge';

export const MERGE_THEME = {
  color: [
    'canvas',
    'surface',
    'raised',
    'raised-hover',
    'ink',
    'muted',
    'line',
    'line-strong',
    'focus',
    'danger',
  ],
  radius: ['lg', 'xl'],
  font: ['sans'],
};

const mergeClasses = extendTailwindMerge({ extend: { theme: MERGE_THEME } });

export function cn(...classes: readonly (string | false | null | undefined)[]): string {
  return mergeClasses(classes);
}
