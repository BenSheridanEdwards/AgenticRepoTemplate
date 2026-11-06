import type { ComponentProps } from 'react';
import { cn } from './cn';

export type ButtonProps = ComponentProps<'button'>;

const BUTTON_CLASSES = cn(
  'cursor-pointer rounded-lg border border-line bg-raised px-4 py-2 text-base font-semibold text-ink transition-colors hover:border-line-strong hover:bg-raised-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
);

export function Button({ type = 'button', className, ...props }: ButtonProps) {
  return <button type={type} className={cn(BUTTON_CLASSES, className)} {...props} />;
}
