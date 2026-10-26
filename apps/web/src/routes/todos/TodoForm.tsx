import { Button, TextField } from '@repo/ui';
import { useTodoForm } from './useTodoForm';

interface TodoFormProps {
  readonly onAdd: (title: string) => Promise<void>;
}

export function TodoForm({ onAdd }: TodoFormProps) {
  const { register, formState, submit } = useTodoForm(onAdd);
  return (
    <form className="todos-form" onSubmit={submit} noValidate>
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
