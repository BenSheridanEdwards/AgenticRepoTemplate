import { Schema } from 'effect';
import { procedure, router } from '../../trpc.ts';
import { listRecentGreetings, recordGreeting } from './application.ts';

const recordInputSchema = Schema.Struct({ name: Schema.Trim.check(Schema.isNonEmpty()) });

const recentGreetingsProcedures = {
  record: procedure
    .input(Schema.toStandardSchemaV1(recordInputSchema))
    .mutation(({ input }) => recordGreeting(input)),
  list: procedure.query(() => listRecentGreetings()),
};

export const recentGreetingsRouter: ReturnType<typeof router<typeof recentGreetingsProcedures>> =
  router(recentGreetingsProcedures);
