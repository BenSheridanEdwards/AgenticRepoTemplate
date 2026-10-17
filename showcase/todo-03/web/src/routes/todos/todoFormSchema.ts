import { Schema } from 'effect';

export const todoFormSchema = Schema.Struct({
  title: Schema.Trim.pipe(Schema.nonEmptyString({ message: () => 'Enter a title' })),
});
