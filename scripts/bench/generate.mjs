/** Clone the tracked reference result without changing workspace configuration. */
export function planWorkspace({ packages, reference }) {
  if (!Number.isInteger(packages) || packages < 2 || packages % 2) {
    throw new Error('packages must be an even integer >= 2');
  }
  return Object.fromEntries(
    Array.from({ length: packages / 2 }, (_, index) => {
      const scope = `bench-${String(index + 1).padStart(3, '0')}`;
      return Object.entries(reference).map(([path, text]) => [
        path.replace(/^apps\//, `showcase/${scope}/`),
        typeof text === 'string'
          ? text.replace(/@repo\/(web|api)\b/g, `@${scope}/$1`)
          : Buffer.from(text),
      ]);
    }).flat(),
  );
}

const BENCH_NOTE = '// generated benchmark clones of the reference result, temp copy only';
const BENCH_IGNORE = '"showcase/bench-*/**"';

/** Append the clones to `key.ignore`, or add that key first when the config has none. */
function withBenchIgnore(text, key) {
  const list = new RegExp(`("${key}"\\s*:\\s*\\{\\s*"ignore"\\s*:\\s*\\[)([\\s\\S]*?)(\\s*\\])`);
  if (list.test(text)) {
    return text.replace(list, (_match, open, items, close) => {
      const kept = items.trim() ? `${items},` : '';
      const end = close.includes('\n') ? close : '\n    ]';
      return `${open}${kept}\n      ${BENCH_NOTE}\n      ${BENCH_IGNORE}${end}`;
    });
  }
  if (new RegExp(`"${key}"\\s*:`).test(text)) {
    throw new Error(
      `.fallowrc.jsonc: put "ignore" first in "${key}" so the benchmark can extend it.`,
    );
  }
  if (!/^\{\n/.test(text)) {
    throw new Error(
      `.fallowrc.jsonc: start the file with "{" on its own line using LF line endings so the benchmark can add "${key}".`,
    );
  }
  return text.replace(
    /^\{\n/,
    `{\n  ${BENCH_NOTE}\n  "${key}": {\n    "ignore": [${BENCH_IGNORE}]\n  },\n`,
  );
}

/** Preserve JSONC bytes outside the two clone-detection lists, adding a list that is absent. */
export function benchFallowConfig(text) {
  if (text.includes(BENCH_IGNORE)) return text;
  return ['duplicates', 'health'].reduce(withBenchIgnore, text);
}
