import type { ComponentProps } from 'react';

export type ButtonProps = ComponentProps<'button'>;

export function Button({ type = 'button', className, ...props }: ButtonProps) {
  return (
    <button type={type} className={['ui-button', className].filter(Boolean).join(' ')} {...props} />
  );
}
