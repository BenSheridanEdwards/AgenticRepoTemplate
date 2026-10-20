import { Button, TextField } from '@repo/ui';
import { useTodoForm } from './useTodoForm';

export interface TodoFormProps {
  readonly onCreate: (title: string) => Promise<unknown>;
}

export function TodoForm({ onCreate }: TodoFormProps) {
  const { register, handleSubmit, reset, formState } = useTodoForm();
  const handleCreate = handleSubmit(async ({ title }) => {
    try {
      await onCreate(title);
      reset();
    } catch {
      // The mutation error is displayed by the page; keep the title for retry.
      return;
    }
  });

  return (
    <form className="todo-form" onSubmit={handleCreate} noValidate>
      <TextField
        label="Title"
        autoComplete="off"
        error={formState.errors.title?.message}
        {...register('title')}
      />
      <Button type="submit" disabled={formState.isSubmitting}>
        Add
      </Button>
    </form>
  );
}
