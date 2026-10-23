import { Button, TextField } from '@repo/ui';
import { useTodoForm } from './useTodoForm';

export interface TodoFormProps {
  readonly onAdd: (title: string) => void;
}

export function TodoForm({ onAdd }: TodoFormProps) {
  const { register, handleSubmit, formState, reset } = useTodoForm();
  const handleAdd = handleSubmit(({ title }) => {
    onAdd(title);
    reset();
  });

  return (
    <form className="todo-form" onSubmit={handleAdd} noValidate>
      <TextField
        label="Title"
        autoComplete="off"
        error={formState.errors.title?.message}
        {...register('title')}
      />
      <Button type="submit">Add</Button>
    </form>
  );
}
