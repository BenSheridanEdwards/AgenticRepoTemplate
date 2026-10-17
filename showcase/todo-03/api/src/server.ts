import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { Schema } from 'effect';
import { appRouter } from './router.ts';

const Port = Schema.NumberFromString.pipe(Schema.int(), Schema.between(1, 65_535));

const port = Schema.decodeUnknownSync(Port)(process.env.PORT ?? '3001');

createHTTPServer({ router: appRouter, basePath: '/trpc/' }).listen(port, '127.0.0.1');

console.log(`api listening on http://127.0.0.1:${port}/trpc`);
