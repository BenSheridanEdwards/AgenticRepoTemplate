import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { Schema } from 'effect';
import { type UseFormReturn, useForm } from 'react-hook-form';
import { todoFormSchema } from './todoFormSchema';

export function useTodoForm(onCreate: (title: string) => Promise<boolean>): UseFormReturn<{
  title: string;
}> & {
  submit: (event?: React.BaseSyntheticEvent) => Promise<void>;
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
