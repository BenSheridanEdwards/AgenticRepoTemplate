import { Schema } from 'effect';

export const greetingFormSchema = Schema.Struct({
  name: Schema.Trim.pipe(Schema.nonEmptyString({ message: () => 'Enter a name' })),
});
