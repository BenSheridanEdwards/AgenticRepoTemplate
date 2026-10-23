import { Button, TextField } from '@repo/ui';
import { useTodoForm } from './useTodoForm';
export function TodoForm({
  onAdd,
  pending,
}: {
  readonly onAdd: (title: string) => Promise<unknown>;
  readonly pending: boolean;
}) {
  const { register, handleSubmit, formState, reset } = useTodoForm();
  const handleAdd = handleSubmit(async ({ title }) => {
    await onAdd(title);
    reset();
  });
  return (
    <form className="greeting-form" noValidate onSubmit={handleAdd}>
      <TextField label="Title" error={formState.errors.title?.message} {...register('title')} />
      <Button type="submit" disabled={pending}>
        Add
      </Button>
    </form>
  );
}
