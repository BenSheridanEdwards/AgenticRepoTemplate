/** @jest-environment node */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cn, MERGE_THEME } from '../packages/ui/src/cn';

const ROOT = resolve(__dirname, '..');
const directory = mkdtempSync(join(tmpdir(), 'tailwind-lint-'));
const cases = [
  ['order', 'text-ink flex p-4', 'enforce-consistent-class-order'],
  ...['bg-red-500', 'text-white', 'font-mono', 'rounded-sm', 'imaginary'].map((value) => [
    value,
    value,
    'no-unknown-classes',
  ]),
  ['conflict', 'p-2 p-4', 'no-conflicting-classes'],
  ['duplicate', 'p-4 p-4', 'no-duplicate-classes'],
  ['deprecated', 'flex-shrink-0', 'no-deprecated-classes'],
  ['shorthand', 'h-4 w-4', 'enforce-shorthand-classes'],
];
const write = (path: string, text: string) => {
  mkdirSync(dirname(join(directory, path)), { recursive: true });
  writeFileSync(join(directory, path), text);
};
write(
  'oxlint.config.ts',
  `import config from ${JSON.stringify(pathToFileURL(join(ROOT, 'oxlint.config.ts')).href)}; export default {...config};`,
);
const lint = (...extra: string[]) =>
  spawnSync(
    join(ROOT, 'node_modules/.bin/oxlint'),
    [
      '--no-ignore',
      '--config',
      'oxlint.config.ts',
      '--deny-warnings',
      '--format',
      'json',
      ...extra,
      '.',
    ],
    { cwd: directory, encoding: 'utf8' },
  );
afterAll(() => rmSync(directory, { recursive: true, force: true }));

const theme =
  readFileSync(join(ROOT, 'packages/ui/src/styles.css'), 'utf8').match(
    /@theme\s*\{([^}]+)\}/,
  )?.[1] ?? '';
const namespaces = [
  'color',
  'font',
  'text',
  'font-weight',
  'tracking',
  'leading',
  'breakpoint',
  'container',
  'spacing',
  'radius',
  'shadow',
  'inset-shadow',
  'text-shadow',
  'drop-shadow',
  'blur',
  'perspective',
  'aspect',
  'ease',
  'animate',
].toSorted((left, right) => right.length - left.length);
const tokens = [...theme.matchAll(/--([\w*-]+)\s*:/g)].map(([, property]) => {
  const namespace = namespaces.find((name) => property.startsWith(`${name}-`)) ?? property;
  return { namespace, name: property.slice(namespace.length + 1) };
});

it('covers every central theme namespace and token in the merge configuration', () => {
  expect(tokens.length).toBeGreaterThan(0);
  expect([...new Set(tokens.map(({ namespace }) => namespace))].toSorted()).toEqual(
    Object.keys(MERGE_THEME).toSorted(),
  );
  Object.entries(MERGE_THEME).forEach(([namespace, values]) => {
    expect(values).toEqual(
      tokens
        .filter((token) => token.namespace === namespace && token.name !== '*')
        .map((token) => token.name),
    );
  });
});

it.each(
  tokens.filter(({ name }) => name !== '*'),
)('merges $namespace token $name independently of other token families', ({ namespace, name }) => {
  const expectations = new Map<string, readonly (readonly [readonly string[], string])[]>([
    [
      'color',
      [
        [['bg-black', `bg-${name}`], `bg-${name}`],
        [['text-base text-black', `text-${name}`], `text-base text-${name}`],
        [['border border-black', `border-${name}`], `border border-${name}`],
      ],
    ],
    [
      'radius',
      [
        [['rounded-sm', `rounded-${name}`], `rounded-${name}`],
        [[`rounded-${name}`, 'rounded-t-none'], `rounded-${name} rounded-t-none`],
      ],
    ],
    ['font', [[['font-serif font-semibold', `font-${name}`], `font-semibold font-${name}`]]],
    [
      'text',
      [
        [['text-base', `text-${name}`, 'text-ink'], `text-${name} text-ink`],
        [['text-ink', `text-${name}`], `text-ink text-${name}`],
      ],
    ],
  ]);
  expect(expectations.has(namespace)).toBe(true);
  expectations.get(namespace)?.forEach(([classes, expected]) => {
    expect(cn(...classes)).toBe(expected);
  });
});

it('enforces each adopted rule in web, UI and showcase using the real v4 theme', () => {
  const roots = ['apps/web', 'packages/ui', 'showcase/probe/web'];
  roots.forEach((root) => {
    cases.forEach(([name, classes]) => {
      write(`${root}/src/${name}.tsx`, `const view = <p className="${classes}" />;`);
    });
    ['p-13', 'w-137', 'mt-999', 'shadow-lg', 'text-xs', 'tracking-widest', 'xl:p-4'].forEach(
      (classes) => {
        write(
          `${root}/src/valid-${classes.replace(':', '-')}.tsx`,
          `const view = <p className="${classes}" />;`,
        );
      },
    );
    write(
      `${root}/src/valid.tsx`,
      'const view = <p className="flex size-4 bg-surface p-2 text-ink hover:bg-raised hover:p-4" />;',
    );
    write(
      `${root}/src/conditional.tsx`,
      "const mode = 'wide'; const view = <p className={mode === 'wide' ? 'w-full' : 'w-4'} />;",
    );
    write(
      `${root}/src/constant.tsx`,
      "import { cn } from '@repo/ui'; const CARD = cn('bg-red-500'); const view = <p className={CARD} />;",
    );
    write(
      `${root}/src/rawConstant.tsx`,
      "const CARD = 'bg-red-500'; const view = <p className={CARD} />;",
    );
    write(`${root}/src/merge.tsx`, 'const view = <p className={`p-4 $' + '{extra}`} />;');
    write(`${root}/src/join.tsx`, "const view = <p className={['p-4', extra].join(' ')} />;");
    write(
      `${root}/src/partial.tsx`,
      "import { cn } from '@repo/ui'; const view = <p className={cn('bg-' + color)} />;",
    );
    write(`${root}/src/add.tsx`, "const view = <p className={'p-4 ' + extra} />;");
    write(`${root}/src/inline.tsx`, 'const view = <p style={{margin: 0}} className="w-[13px]" />;');
  });
  write('apps/api/src/ignored.tsx', 'const view = <p className="imaginary" />;');
  write('apps/web/src/ignored.test.tsx', 'const view = <p className="test-sentinel" />;');
  const result = lint();
  expect(result.stderr).toBe('');
  expect(result.status).toBe(1);
  const diagnostics = JSON.parse(result.stdout).diagnostics.filter(
    ({ code }: { code: string }) =>
      code.startsWith('better-tailwindcss(') || code === 'policy(no-arbitrary-styles)',
  );
  const expected = [
    ...cases.map(([name, , rule]) => [name, `better-tailwindcss(${rule})`]),
    ...['rawConstant', 'merge', 'join', 'add', 'inline'].map((name) => [
      name,
      'policy(no-arbitrary-styles)',
    ]),
    ['constant', 'better-tailwindcss(no-unknown-classes)'],
    ['partial', 'better-tailwindcss(no-concatenated-classes)'],
  ];
  roots.forEach((root) => {
    expected.forEach(([name, code]) => {
      expect(diagnostics).toContainEqual(
        expect.objectContaining({
          filename: expect.stringContaining(`${root}/src/${name}.tsx`),
          code,
          severity: 'error',
        }),
      );
    });
  });
  expect(
    diagnostics.filter(({ filename }: { filename: string }) =>
      /(?:valid|ignored|conditional)/.test(filename),
    ),
  ).toEqual([]);
});

it('checks class values once while allowing predicates and requiring the imported merging helper', () => {
  const valid = [
    "cn('p-4', isActive(tone) && 'bg-surface')",
    "cn('p-4', LIST.includes(tone) && 'bg-surface')",
    "cn('p-4', count + 1 > 2 && 'bg-surface')",
    "cn('p-4', isActive(tone) ? 'bg-surface' : 'bg-canvas')",
    "cn('p-4', extra || 'bg-surface')",
    "cn('p-4', extra ?? 'bg-surface')",
  ];
  const invalid = [
    "cn('p-4', active && ('bg-' + tone))",
    "cn('p-4', active && buildClasses(tone))",
    "cn('p-4', ('bg-' + tone) || 'bg-surface')",
    "cn('p-4', extra || ('bg-' + tone))",
    "cn('p-4', ('bg-' + tone) ?? 'bg-surface')",
    "cn('p-4', extra ?? ('bg-' + tone))",
    "cn('p-4', isActive(tone) ? ('bg-' + tone) : 'bg-canvas')",
    "cn('p-4', active && `bg-$" + '{tone}`)',
    "cn('bg-' + tone)",
    "cn('w-[13px]')",
  ];
  const fixtures: readonly (readonly [string, string, number])[] = [
    ...valid.map<readonly [string, string, number]>((value, index) => [`valid-${index}`, value, 0]),
    ['invalid-multiple', "cn(['w-[13px]'].join(' '))", 2],
    ...invalid.map<readonly [string, string, number]>((value, index) => [
      `invalid-${index}`,
      value,
      1,
    ]),
  ];
  const roots = ['apps/web', 'packages/ui', 'showcase/probe/web'];
  roots.forEach((root) => {
    const imported = root === 'packages/ui' ? './cn' : '@repo/ui';
    fixtures.forEach(([name, value]) => {
      write(
        `${root}/src/probe-${name}.tsx`,
        `import { cn } from '${imported}'; const view = <p className={${value}} />;`,
      );
    });
    write(
      `${root}/src/probe-local.tsx`,
      "const cn = (...a) => a.join(' '); const view = <p className={cn('p-4')} />;",
    );
    write(
      `${root}/src/probe-wrongImport.tsx`,
      "import { cn } from 'another-package'; const view = <p className={cn('p-4')} />;",
    );
    write(
      `${root}/src/probe-shadowed.tsx`,
      `import { cn } from '${imported}'; function view(cn) { return <p className={cn('p-4')} />; }`,
    );
    write(`${root}/src/probe-missing.tsx`, "const view = <p className={cn('p-4')} />;");
  });
  write(
    'apps/web/src/probe-relative.tsx',
    "import { cn } from './cn'; const view = <p className={cn('p-4')} />;",
  );
  const result = lint();
  expect(result.stderr).toBe('');
  expect(result.status).toBe(1);
  const diagnostics = JSON.parse(result.stdout).diagnostics;
  roots.forEach((root) => {
    [
      ...fixtures,
      ...['local', 'wrongImport', 'shadowed', 'missing'].map<readonly [string, string, number]>(
        (name) => [name, '', 1],
      ),
    ].forEach(([name, , count]) => {
      expect(
        diagnostics.filter(
          ({ filename, code }: { filename: string; code: string }) =>
            filename === `${root}/src/probe-${name}.tsx` && code === 'policy(no-arbitrary-styles)',
        ),
      ).toHaveLength(count);
    });
  });
  expect(
    diagnostics.filter(
      ({ filename, code }: { filename: string; code: string }) =>
        filename === 'apps/web/src/probe-relative.tsx' && code === 'policy(no-arbitrary-styles)',
    ),
  ).toHaveLength(1);
  expect(
    diagnostics.filter(
      ({ filename, code }: { filename: string; code: string }) =>
        /probe-valid-/.test(filename) &&
        (code.startsWith('better-tailwindcss(') || code === 'policy(no-arbitrary-styles)'),
    ),
  ).toEqual([]);
  roots.forEach((root) => {
    expect(
      diagnostics
        .filter(
          ({ filename, code }: { filename: string; code: string }) =>
            filename === `${root}/src/probe-invalid-8.tsx` &&
            (code.startsWith('better-tailwindcss(') || code === 'policy(no-arbitrary-styles)'),
        )
        .map(({ code }: { code: string }) => code)
        .toSorted(),
    ).toEqual(['better-tailwindcss(no-concatenated-classes)', 'policy(no-arbitrary-styles)']);
  });
});

it('autofixes class order without a formatting loop with Biome', () => {
  const path = 'packages/ui/src/fix.tsx';
  write(path, 'export const view = <p className="text-ink size-4 flex p-4" />;\n');
  const result = lint('--fix', join(directory, path));
  expect(result.stderr).toBe('');
  const fixed = readFileSync(join(directory, path), 'utf8');
  expect(fixed).toContain('className="flex size-4 p-4 text-ink"');
  const biome = spawnSync(
    join(ROOT, 'node_modules/.bin/biome'),
    ['check', '--write', '--error-on-warnings', '--config-path', ROOT, join(directory, path)],
    { cwd: ROOT, encoding: 'utf8' },
  );
  expect(biome.status).toBe(0);
  expect(readFileSync(join(directory, path), 'utf8')).toBe(fixed);
});
