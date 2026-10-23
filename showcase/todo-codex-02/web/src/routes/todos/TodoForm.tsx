import { Button, TextField } from '@repo/ui';
import { useTodoForm } from './useTodoForm';

interface TodoFormProps {
  readonly onAdd: (title: string) => Promise<unknown>;
}
export function TodoForm({ onAdd }: TodoFormProps) {
  const { register, handleSubmit, reset, formState } = useTodoForm();
  const handleAdd = handleSubmit(async ({ title }) => {
    try {
      await onAdd(title);
      reset();
    } catch {
      return;
    }
  });
  return (
    <form className="greeting-form" onSubmit={handleAdd} noValidate>
      <TextField label="Title" error={formState.errors.title?.message} {...register('title')} />
      <Button type="submit" disabled={formState.isSubmitting}>
        Add
      </Button>
    </form>
  );
}
