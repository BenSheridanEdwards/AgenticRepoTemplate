import { Button, TextField } from '@repo/ui';
import { useGreetingForm } from './useGreetingForm';

export interface GreetingFormProps {
  readonly onGreet: (name: string) => void;
}

export function GreetingForm({ onGreet }: GreetingFormProps) {
  const { register, handleSubmit, formState } = useGreetingForm();
  const handleGreet = handleSubmit(({ name }) => onGreet(name));

  return (
    <form className="greeting-form" onSubmit={handleGreet} noValidate>
      <TextField
        label="Name"
        autoComplete="off"
        error={formState.errors.name?.message}
        {...register('name')}
      />
      <Button type="submit">Greet</Button>
    </form>
  );
}
