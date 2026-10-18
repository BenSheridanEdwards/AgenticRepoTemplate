import { Schema } from 'effect';
import { todoFormSchema } from './todoFormSchema';

const validate = (title: string) =>
  Schema.toStandardSchemaV1(todoFormSchema)['~standard'].validate({ title });

it('trims the title', () => {
  expect(validate('  Buy milk ')).toEqual({ value: { title: 'Buy milk' } });
});

it.each(['', '   '])('asks for a title when it is %j', (title) => {
  expect(validate(title)).toEqual({ issues: [{ path: ['title'], message: 'Enter a title' }] });
});
