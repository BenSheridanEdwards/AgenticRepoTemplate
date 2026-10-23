import { Button, TextField } from '@repo/ui';
import { useTodoForm } from './useTodoForm';

interface TodoFormProps {
  readonly onCreate: (title: string) => Promise<unknown>;
  readonly pending: boolean;
}
export function TodoForm({ onCreate, pending }: TodoFormProps) {
  const { register, handleSubmit, formState, reset } = useTodoForm();
  const handleCreate = handleSubmit(async ({ title }) => {
    try {
      await onCreate(title);
      reset();
    } catch {
      return;
    }
  });
  return (
    <form className="greeting-form" onSubmit={handleCreate} noValidate>
      <TextField label="Title" error={formState.errors.title?.message} {...register('title')} />
      <Button type="submit" disabled={pending}>
        Add
      </Button>
    </form>
  );
}
