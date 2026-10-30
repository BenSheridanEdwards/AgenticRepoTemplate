import { Schema, SchemaTransformation } from 'effect';

export const greetingFormSchema = Schema.Struct({
  name: Schema.Trim.pipe(
    Schema.decodeTo(
      Schema.String,
      SchemaTransformation.transform({
        decode: (trimmed) => trimmed.replace(/\s+/gu, ' '),
        encode: (collapsed) => collapsed,
      }),
    ),
  ).check(Schema.isNonEmpty({ message: 'Enter a name' })),
});
