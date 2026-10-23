import { Button, TextField } from '@repo/ui';
import { useTodoForm } from './useTodoForm';

export interface TodoFormProps {
  readonly onCreate: (title: string) => Promise<unknown>;
}

export function TodoForm({ onCreate }: TodoFormProps) {
  const { register, submit, formState } = useTodoForm(onCreate);
  return (
    <form className="todo-form" onSubmit={submit} noValidate>
      <TextField
        label="Title"
        autoComplete="off"
        error={formState.errors.title?.message}
        {...register('title')}
      />
      <Button type="submit" disabled={formState.isSubmitting}>
        Add
      </Button>
      {formState.errors.root ? <p role="alert">{formState.errors.root.message}</p> : null}
    </form>
  );
}
