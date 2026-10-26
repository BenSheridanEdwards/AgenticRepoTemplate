import { readFileSync } from 'node:fs';
import { BRIEFS } from './briefs.mjs';

it.each(['todo', 'notes'])('publishes the complete %s HTTP contract in its prompt', (brief) => {
  const { api, operations } = BRIEFS[brief];
  expect(api).toBeDefined();
  const prompt = readFileSync(new URL(`./${brief}-prompt.md`, import.meta.url), 'utf8');
  expect(api.router).toBe(brief === 'todo' ? 'todos' : 'notes');
  expect(Object.keys(api.procedures)).toEqual(operations);
  expect(prompt).toContain(api.item);
  Object.entries(api.procedures).forEach(([name, procedure]) => {
    expect(prompt).toContain(
      `| ${api.router}.${name} | ${procedure.kind} | \`${procedure.input}\` | \`${procedure.output}\` |`,
    );
  });
});
