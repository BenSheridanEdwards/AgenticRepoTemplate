import { Either, ParseResult, Schema } from 'effect';
import { greetingFormSchema } from './greetingFormSchema';

const decode = (name: string) =>
  Schema.decodeUnknownEither(greetingFormSchema)({ name }).pipe(
    Either.mapLeft((error) => ParseResult.ArrayFormatter.formatErrorSync(error)[0]?.message),
  );

it('trims the name', () => {
  expect(decode('  Ada ')).toEqual(Either.right({ name: 'Ada' }));
});

it.each(['', '   '])('asks for a name when it is %j', (name) => {
  expect(decode(name)).toEqual(Either.left('Enter a name'));
});
