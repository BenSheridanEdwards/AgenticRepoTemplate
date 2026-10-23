import { Schema } from 'effect';
export const todoFormSchema = Schema.Struct({
  title: Schema.Trim.check(Schema.isNonEmpty({ message: 'Enter a title' })),
});
