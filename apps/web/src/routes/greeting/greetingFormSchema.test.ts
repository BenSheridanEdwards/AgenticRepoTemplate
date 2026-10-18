import { Schema } from 'effect';
import { greetingFormSchema } from './greetingFormSchema';

const validate = (name: string) =>
  Schema.toStandardSchemaV1(greetingFormSchema)['~standard'].validate({ name });

it('trims the name', () => {
  expect(validate('  Ada ')).toEqual({ value: { name: 'Ada' } });
});

it.each(['', '   '])('asks for a name when it is %j', (name) => {
  expect(validate(name)).toEqual({ issues: [{ path: ['name'], message: 'Enter a name' }] });
});
