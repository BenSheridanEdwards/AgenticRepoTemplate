import gate from './.oxlintrc.json' with { type: 'json' };

export default {
  ...gate,
  rules: {
    ...gate.rules,
    'anti-slop/require-readable-spacing': 'warn',
    'anti-slop/require-safety-comment-for-type-assertion': 'warn',
    'anti-slop/no-shape-in-symbol-names': 'warn',
    'anti-slop/no-array-filter-map': 'warn',
    'anti-slop/no-known-value-widening': 'warn',
    'anti-slop/no-unsafe-dictionary-type': 'warn',
    'anti-slop/no-unknown-parameters': 'warn',
    'anti-slop/no-object-parameters': 'warn',
    'anti-slop/no-chained-type-assertions': 'warn',
    'anti-slop/no-conditional-empty-object-spread': 'warn',
    'anti-slop/no-unknown-returns': 'warn',
    'anti-slop/no-runtime-typeof': 'warn',
  },
};
