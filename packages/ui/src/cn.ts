import { twMerge } from 'tailwind-merge';

export function cn(...classes: readonly (string | false | null | undefined)[]): string {
  return twMerge(classes);
}
