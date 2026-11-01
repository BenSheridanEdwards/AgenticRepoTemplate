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
        text.replace(/@repo\/(web|api)\b/g, `@${scope}/$1`),
      ]);
    }).flat(),
  );
}

/** Preserve JSONC bytes outside the two clone-detection lists. */
export function benchFallowConfig(text) {
  if (text.includes('"showcase/bench-*/**"')) return text;
  return text.replace(
    /("(?:duplicates|health)"\s*:\s*\{\s*"ignore"\s*:\s*\[)([\s\S]*?)(\n\s*\])/g,
    '$1$2,\n      // generated benchmark clones of the reference result, temp copy only\n      "showcase/bench-*/**"$3',
  );
}
