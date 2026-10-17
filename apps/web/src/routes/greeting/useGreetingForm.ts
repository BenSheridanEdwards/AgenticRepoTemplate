import { effectTsResolver } from '@hookform/resolvers/effect-ts';
import { useForm } from 'react-hook-form';
import { greetingFormSchema } from './greetingFormSchema';

export function useGreetingForm() {
  return useForm({ resolver: effectTsResolver(greetingFormSchema), defaultValues: { name: '' } });
}
