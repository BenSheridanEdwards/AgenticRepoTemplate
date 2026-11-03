import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkStyles, isStyleFile } from './check-styles.mjs';

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const THEME = `@import "tailwindcss" source(none);
@source "./";
@custom-variant aria-invalid (&[aria-invalid="true"]);
/* Tokens such as #000 may be named in a comment. */
@theme {
  --color-*: initial;
  --color-ink: #e6e9f2;
  --color-tint: oklch(0.5 0.1 200);
}
@layer base {
  body {
    color: var(--color-ink);
  }
}
`;
const messages = (path: string, text: string) =>
  checkStyles([{ path, text }]).map(({ line, message }) => `${line} ${message}`);

it('reads result CSS, package CSS and each web index.html, and nothing else', () => {
  expect(
    [
      'apps/web/src/index.css',
      'apps/web/src/routes/todos/todos.css',
      'packages/ui/src/styles.css',
      'showcase/todo-01/web/src/index.css',
      'apps/web/index.html',
      'showcase/todo-01/web/index.html',
      'docs/site.css',
      'apps/web/dist/assets/index.css',
      'tooling/lighthouse/report.html',
    ].filter(isStyleFile),
  ).toEqual([
    'apps/web/src/index.css',
    'apps/web/src/routes/todos/todos.css',
    'packages/ui/src/styles.css',
    'showcase/todo-01/web/src/index.css',
    'apps/web/index.html',
    'showcase/todo-01/web/index.html',
  ]);
});

it('accepts colour literals inside the @theme block of the @repo/ui stylesheet', () => {
  expect(messages('packages/ui/src/styles.css', THEME)).toEqual([]);
});

it('rejects a @theme block in any other stylesheet', () => {
  expect(messages('packages/ui/src/other.css', THEME)).toEqual([
    '5 @theme block: the design tokens live only in packages/ui/src/styles.css',
  ]);
});

it('rejects colour literals and arbitrary @apply values outside the @theme block', () => {
  expect(
    messages(
      'packages/ui/src/styles.css',
      `${THEME}.card {\n  border-color: #273150;\n  background: rgb(0 0 0);\n  @apply w-[13px] w-(--x) bg-(--color-ink) p-4;\n}\n`,
    ),
  ).toEqual([
    '16 colour literal `#273150`: use a @repo/ui colour token class',
    '17 colour literal `rgb(`: use a @repo/ui colour token class',
    '18 Tailwind arbitrary value `w-[13px]`: use a class on the theme scale',
    '18 Tailwind arbitrary value `w-(--x)`: use a class on the theme scale',
    '18 Tailwind arbitrary value `bg-(--color-ink)`: use a class on the theme scale',
  ]);
});

it('accepts a result stylesheet that only imports the design system and lists sources', () => {
  expect(
    messages(
      'apps/web/src/index.css',
      '/* The app entry. */\n@import "@repo/ui/styles.css";\n@source "./";\n',
    ),
  ).toEqual([]);
});

it('rejects hand-written CSS in a result stylesheet', () => {
  expect(
    messages(
      'showcase/todo-01/web/src/routes/todos/todos.css',
      '@import "@repo/ui/styles.css";\n.todo {\n  width: 13px;\n}\n',
    ),
  ).toEqual([
    "2 hand-written CSS `.todo {`: style with Tailwind classes; a result's CSS holds only @import and @source lines",
  ]);
});

it('rejects inline styles, arbitrary classes and colour literals in index.html', () => {
  expect(
    messages(
      'apps/web/index.html',
      '<body style="margin: 0">\n  <div class="p-4 bg-[#fff]"></div>\n</body>\n',
    ),
  ).toEqual([
    '1 inline style attribute: style with Tailwind classes',
    '2 Tailwind arbitrary value `bg-[#fff]`: use a class on the theme scale',
    '2 colour literal `#fff`: use a @repo/ui colour token class',
  ]);
  expect(
    messages('apps/web/index.html', '<body>\n  <div id="root" class="p-4"></div>\n</body>\n'),
  ).toEqual([]);
});

it('passes on this repository', () => {
  const result = spawnSync('node', ['scripts/check-styles.mjs'], {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
  });
  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
});
