import { Schema } from 'effect';

export const greetingFormSchema = Schema.Struct({
  name: Schema.Trim.check(Schema.isNonEmpty({ message: 'Enter a name' })),
});
