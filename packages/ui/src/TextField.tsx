import { type ComponentProps, useId } from 'react';

export interface TextFieldProps extends Omit<ComponentProps<'input'>, 'id'> {
  readonly label: string;
  readonly error?: string | undefined;
}

export function TextField({ label, error, ...inputProps }: TextFieldProps) {
  const inputId = useId();
  const errorId = `${inputId}-error`;
  return (
    <div className="ui-text-field">
      <label className="ui-text-field__label" htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        className="ui-text-field__input"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...inputProps}
      />
      {error ? (
        <p id={errorId} role="alert" className="ui-text-field__error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
