import { Button, TextField } from '@repo/ui';
import { useTodoForm } from './useTodoForm';

export interface TodoFormProps {
  readonly onCreate: (title: string) => Promise<void>;
}

export function TodoForm({ onCreate }: TodoFormProps) {
  const { register, handleSubmit, formState, reset } = useTodoForm();
  const handleCreate = handleSubmit(async ({ title }) => {
    await onCreate(title);
    reset();
  });
  return (
    <form className="greeting-form" onSubmit={handleCreate} noValidate>
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
