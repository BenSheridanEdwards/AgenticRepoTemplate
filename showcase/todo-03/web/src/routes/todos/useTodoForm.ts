import { effectTsResolver } from '@hookform/resolvers/effect-ts';
import { useForm } from 'react-hook-form';
import { todoFormSchema } from './todoFormSchema';

export function useTodoForm() {
  return useForm({ resolver: effectTsResolver(todoFormSchema), defaultValues: { title: '' } });
}
