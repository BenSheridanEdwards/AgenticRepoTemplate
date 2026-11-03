import { type ComponentProps, useId } from 'react';

export interface TextFieldProps extends Omit<ComponentProps<'input'>, 'id'> {
  readonly label: string;
  readonly error?: string | undefined;
}

const INPUT_CLASSES =
  'rounded-lg border border-line bg-canvas px-3 py-2 text-base text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus aria-invalid:border-danger';

export function TextField({ label, error, className, ...inputProps }: TextFieldProps) {
  const inputId = useId();
  const errorId = `${inputId}-error`;
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-semibold" htmlFor={inputId}>
        {label}
      </label>
      <input
        {...inputProps}
        id={inputId}
        className={[INPUT_CLASSES, className].filter(Boolean).join(' ')}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      />
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
