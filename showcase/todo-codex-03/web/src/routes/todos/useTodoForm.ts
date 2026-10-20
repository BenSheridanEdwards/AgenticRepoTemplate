import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { Schema } from 'effect';
import { type UseFormReturn, useForm } from 'react-hook-form';
import { todoFormSchema } from './todoFormSchema';

interface TodoFormValues {
  title: string;
}

export function useTodoForm(
  onCreate: (title: string) => Promise<boolean>,
): UseFormReturn<TodoFormValues> & {
  readonly submit: ReturnType<UseFormReturn<TodoFormValues>['handleSubmit']>;
} {
  const form = useForm({
    resolver: standardSchemaResolver(Schema.toStandardSchemaV1(todoFormSchema)),
    defaultValues: { title: '' },
  });
  const submit = form.handleSubmit(async ({ title }) => {
    if (await onCreate(title)) {
      form.reset();
    }
  });
  return { ...form, submit };
}
