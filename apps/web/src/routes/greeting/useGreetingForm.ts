import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { Schema } from 'effect';
import { useForm } from 'react-hook-form';
import { greetingFormSchema } from './greetingFormSchema';

export function useGreetingForm() {
  return useForm({
    resolver: standardSchemaResolver(Schema.toStandardSchemaV1(greetingFormSchema)),
    defaultValues: { name: '' },
  });
}
