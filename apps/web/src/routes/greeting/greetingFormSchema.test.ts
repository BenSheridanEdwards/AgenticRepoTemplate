import { Schema } from 'effect';
import { greetingFormSchema } from './greetingFormSchema';

const validate = (name: string) =>
  Schema.toStandardSchemaV1(greetingFormSchema)['~standard'].validate({ name });

it('trims the name', () => {
  expect(validate('  Ada ')).toEqual({ value: { name: 'Ada' } });
});

it.each([
  ['Ada\tLovelace', 'Ada Lovelace'],
  ['Ada\n\nLovelace', 'Ada Lovelace'],
  ['Ada\u00a0\u00a0Lovelace', 'Ada Lovelace'],
])('collapses whitespace runs in %j', (input, name) => {
  expect(validate(input)).toEqual({ value: { name } });
});

it.each(['', '   '])('asks for a name when it is %j', (name) => {
  expect(validate(name)).toEqual({ issues: [{ path: ['name'], message: 'Enter a name' }] });
});
