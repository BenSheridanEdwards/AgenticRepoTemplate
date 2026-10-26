import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { Schema } from 'effect';
import { type UseFormReturn, useForm } from 'react-hook-form';
import { todoFormSchema } from './todoFormSchema';

interface TodoFormValues {
  readonly title: string;
}

type TodoForm = UseFormReturn<TodoFormValues>;

export function useTodoForm(onAdd: (title: string) => Promise<void>): Pick<
  TodoForm,
  'register' | 'formState'
> & {
  readonly submit: ReturnType<TodoForm['handleSubmit']>;
} {
  const form = useForm({
    resolver: standardSchemaResolver(Schema.toStandardSchemaV1(todoFormSchema)),
    defaultValues: { title: '' },
  });
  const submit = form.handleSubmit(async ({ title }) => {
    try {
      await onAdd(title);
      form.reset();
    } catch {
      form.setError('root', { message: 'Could not add todo. Try again.' });
    }
  });
  return { register: form.register, formState: form.formState, submit };
}
