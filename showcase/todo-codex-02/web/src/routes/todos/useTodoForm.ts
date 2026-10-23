import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { Schema } from 'effect';
import { useForm } from 'react-hook-form';
import { todoFormSchema } from './todoFormSchema';
export function useTodoForm() {
  return useForm({
    resolver: standardSchemaResolver(Schema.toStandardSchemaV1(todoFormSchema)),
    defaultValues: { title: '' },
  });
}
