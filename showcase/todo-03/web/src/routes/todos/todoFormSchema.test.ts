import { Either, ParseResult, Schema } from 'effect';
import { todoFormSchema } from './todoFormSchema';

const decode = (title: string) =>
  Schema.decodeUnknownEither(todoFormSchema)({ title }).pipe(
    Either.mapLeft((error) => ParseResult.ArrayFormatter.formatErrorSync(error)[0]?.message),
  );

it('trims the title', () => {
  expect(decode('  Buy milk ')).toEqual(Either.right({ title: 'Buy milk' }));
});

it.each(['', '   '])('asks for a title when it is %j', (title) => {
  expect(decode(title)).toEqual(Either.left('Enter a title'));
});
