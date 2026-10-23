export interface TodosErrorProps {
  readonly loadFailed: boolean;
  readonly saveFailed: boolean;
}

export function TodosError({ loadFailed, saveFailed }: TodosErrorProps) {
  return (
    <>
      {loadFailed ? (
        <p role="alert" className="todos-error">
          Could not load the todos
        </p>
      ) : null}
      {saveFailed ? (
        <p role="alert" className="todos-error">
          Could not save the change
        </p>
      ) : null}
    </>
  );
}
