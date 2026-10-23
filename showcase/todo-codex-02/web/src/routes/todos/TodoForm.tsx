import { Button, TextField } from '@repo/ui';
import { useTodoForm } from './useTodoForm';

export interface TodoFormProps {
  readonly onCreate: (title: string) => Promise<boolean>;
  readonly pending: boolean;
}

export function TodoForm({ onCreate, pending }: TodoFormProps) {
  const { register, submit, formState } = useTodoForm(onCreate);
  return (
    <form className="todo-form" onSubmit={submit} noValidate>
      <TextField
        label="Title"
        autoComplete="off"
        error={formState.errors.title?.message}
        {...register('title')}
      />
      <Button type="submit" disabled={pending}>
        Add
      </Button>
    </form>
  );
}
