import { Schema } from 'effect';
import { procedure, router } from '../../trpc.ts';
import { greet } from './application.ts';

const greetInputSchema = Schema.Struct({ name: Schema.Trim.pipe(Schema.nonEmptyString()) });

export const greetingRouter = router({
  greet: procedure
    .input(Schema.standardSchemaV1(greetInputSchema))
    .query(({ input }) => greet(input)),
});
