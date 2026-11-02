import { fileURLToPath } from 'node:url';
import { RECOMMENDED_RULES } from 'oxlint-plugin-react-doctor';

// Each excluded rule repeats a check owned by the engine named beside it.
const singleOwnerRules = {
  'react-doctor/alt-text': true, // Biome a11y/useAltText
  'react-doctor/anchor-ambiguous-text': true, // Biome a11y/noAmbiguousAnchorText
  'react-doctor/anchor-has-content': true, // Biome a11y/useAnchorContent
  'react-doctor/anchor-is-valid': true, // Biome a11y/useValidAnchor
  'react-doctor/aria-activedescendant-has-tabindex': true, // Biome a11y/useAriaActivedescendantWithTabindex
  'react-doctor/aria-props': true, // Biome a11y/useValidAriaProps
  'react-doctor/aria-proptypes': true, // Biome a11y/useValidAriaValues
  'react-doctor/aria-role': true, // Biome a11y/useValidAriaRole
  'react-doctor/aria-unsupported-elements': true, // Biome a11y/noAriaUnsupportedElements
  'react-doctor/autocomplete-valid': true, // Biome a11y/useValidAutocomplete
  'react-doctor/button-has-type': true, // Biome a11y/useButtonType
  'react-doctor/click-events-have-key-events': true, // Biome a11y/useKeyWithClickEvents
  'react-doctor/heading-has-content': true, // Biome a11y/useHeadingContent
  'react-doctor/html-has-lang': true, // Biome a11y/useHtmlLang
  'react-doctor/iframe-has-title': true, // Biome a11y/useIframeTitle
  'react-doctor/img-redundant-alt': true, // Biome a11y/noRedundantAlt
  'react-doctor/interactive-supports-focus': true, // Biome a11y/useFocusableInteractive
  'react-doctor/label-has-associated-control': true, // Biome a11y/noLabelWithoutControl
  'react-doctor/lang': true, // Biome a11y/useValidLang
  'react-doctor/media-has-caption': true, // Biome a11y/useMediaCaption
  'react-doctor/mouse-events-have-key-events': true, // Biome a11y/useKeyWithMouseEvents
  'react-doctor/no-access-key': true, // Biome a11y/noAccessKey
  'react-doctor/no-aria-hidden-on-focusable': true, // Biome a11y/noAriaHiddenOnFocusable
  'react-doctor/no-autofocus': true, // Biome a11y/noAutofocus
  'react-doctor/no-distracting-elements': true, // Biome a11y/noDistractingElements
  'react-doctor/no-interactive-element-to-noninteractive-role': true, // Biome a11y/noInteractiveElementToNoninteractiveRole
  'react-doctor/no-noninteractive-element-to-interactive-role': true, // Biome a11y/noNoninteractiveElementToInteractiveRole
  'react-doctor/no-noninteractive-tabindex': true, // Biome a11y/noNoninteractiveTabindex
  'react-doctor/no-redundant-roles': true, // Biome a11y/noRedundantRoles
  'react-doctor/no-static-element-interactions': true, // Biome a11y/noStaticElementInteractions
  'react-doctor/prefer-tag-over-role': true, // Biome a11y/useSemanticElements
  'react-doctor/role-has-required-aria-props': true, // Biome a11y/useAriaPropsForRole
  'react-doctor/role-supports-aria-props': true, // Biome a11y/useAriaPropsSupportedByRole
  'react-doctor/scope': true, // Biome a11y/noHeaderScope
  'react-doctor/tabindex-no-positive': true, // Biome a11y/noPositiveTabindex
  'react-doctor/jsx-key': true, // Biome correctness/useJsxKeyInIterable
  'react-doctor/no-render-return-value': true, // Biome correctness/noRenderReturnValue
  'react-doctor/void-dom-elements-no-children': true, // Biome correctness/noVoidElementsWithChildren
  'react-doctor/no-spread-accumulator-in-reduce': true, // Biome performance/noAccumulatingSpread
  'react-doctor/jsx-no-script-url': true, // Biome security/noScriptUrl
  'react-doctor/jsx-no-target-blank': true, // Biome security/noBlankTarget
  'react-doctor/no-danger-with-children': true, // Biome security/noDangerouslySetInnerHtmlWithChildren
  'react-doctor/no-eval': true, // Biome security/noGlobalEval
  'react-doctor/no-non-null-assertion-on-maybe-undefined-result': true, // Biome style/noNonNullAssertion
  'react-doctor/jsx-no-comment-textnodes': true, // Biome suspicious/noCommentText
  'react-doctor/jsx-no-duplicate-props': true, // Biome suspicious/noDuplicateJsxProps
  'react-doctor/no-array-index-as-key': true, // Biome suspicious/noArrayIndexKey
  'react-doctor/rules-of-hooks': true, // react-hooks/rules-of-hooks
  'react-doctor/exhaustive-deps': true, // react-hooks/exhaustive-deps
  'react-doctor/no-set-state-in-render': true, // react-hooks/set-state-in-render
  'react-doctor/no-derived-state-effect': true, // react-hooks/set-state-in-effect
  'react-doctor/no-ref-current-in-render': true, // react-hooks/refs
  'react-doctor/no-nested-component-definition': true, // react-hooks/static-components
  'react-doctor/no-unstable-nested-components': true, // react-hooks/static-components
};

const unusedFrameworkPrefixes = [
  'r3f-',
  'three-',
  'motion-',
  'shadcn-',
  'tanstack-',
  'react-router-',
  'zod-v4-',
  'ink-',
  'jotai-',
  'mobx-',
  'redux-',
  'valtio-',
  'zustand-',
  'server-',
  'base-ui-',
  'radix-',
  'react-aria-',
  'styled-components-',
  'webgl-',
  'react-markdown-',
];
const unusedFrameworkRules = [
  'use-lazy-motion',
  'no-conflicting-spring-options',
  'no-static-motion-config-never',
];
const reactDoctorRules = Object.fromEntries(
  Object.entries(RECOMMENDED_RULES)
    .filter(([name]) => !Object.hasOwn(singleOwnerRules, name))
    .filter(
      ([name, severity]) =>
        severity !== 'warn' ||
        !(
          unusedFrameworkPrefixes.some((prefix) => name.startsWith(`react-doctor/${prefix}`)) ||
          unusedFrameworkRules.some((rule) => name === `react-doctor/${rule}`)
        ),
    )
    .map(([name]) => [name, 'error']),
);

export default {
  categories: {
    correctness: 'off',
    suspicious: 'off',
    pedantic: 'off',
    perf: 'off',
    style: 'off',
    restriction: 'off',
    nursery: 'off',
  },
  plugins: ['react', 'unicorn'],
  options: { respectEslintDisableDirectives: false },
  jsPlugins: [
    fileURLToPath(new URL('./tooling/oxlint-plugin-policy.js', import.meta.url)),
    {
      name: 'react-doctor',
      specifier: fileURLToPath(import.meta.resolve('oxlint-plugin-react-doctor')),
    },
  ],
  settings: { 'react-doctor': { portedRuleMode: 'curated' } },
  ignorePatterns: [
    '**/dist/**',
    'coverage/**',
    'vendor/**',
    'playwright-report/**',
    'test-results/**',
    '.cache/**',
  ],
  rules: {
    'no-else-return': ['error', { allowElseIf: false }],
    'no-param-reassign': ['error', { props: true }],
    'policy/no-loops': 'error',
    'policy/no-hand-written-globs': 'error',
  },
  overrides: [
    {
      files: ['{apps,packages}/*/src/**/*.{ts,tsx}', 'showcase/*/*/src/**/*.{ts,tsx}'],
      rules: {
        'no-lonely-if': 'error',
        'no-nested-ternary': 'error',
        'unicorn/no-array-for-each': 'error',
        'unicorn/no-array-sort': 'error',
        'unicorn/no-array-reverse': 'error',
        'unicorn/prefer-array-find': 'error',
        'unicorn/prefer-array-some': 'error',
        'unicorn/prefer-array-flat': 'error',
        'unicorn/prefer-object-from-entries': 'error',
        ...reactDoctorRules,
        'react/rules-of-hooks': 'error',
        'react/exhaustive-deps': 'error',
        'react/error-boundaries': 'error',
        'react/globals': 'error',
        'react/immutability': 'error',
        'react/incompatible-library': 'error',
        'react/preserve-manual-memoization': 'error',
        'react/purity': 'error',
        'react/refs': 'error',
        'react/set-state-in-effect': 'error',
        'react/set-state-in-render': 'error',
        'react/static-components': 'error',
        'react/use-memo': 'error',
        'react/void-use-memo': 'error',
        'react/unsupported-syntax': 'error',
        'react-doctor/prefer-function-component': 'error',
        'policy/one-component-per-file': 'error',
        'policy/no-large-comments': 'error',
        'policy/use-ui-primitives': 'error',
        'policy/state-and-effects-in-hooks': 'error',
        'policy/handler-names': 'error',
        'policy/callback-prop-names': 'error',
        'policy/pages-in-routes': 'error',
        'policy/file-matches-export': 'error',
        'policy/folder-names': 'error',
        'policy/role-named-folders': 'error',
        'policy/test-beside-subject': 'error',
        'policy/slice-isolation': 'error',
        'policy/procedure-input-schema': 'error',
        'policy/form-uses-effect-schema': 'error',
        'max-depth': ['error', 4],
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: [
                  '**/features/*/*',
                  '**/shared/*/*',
                  '**/routes/*/*',
                  '**/api-client/*',
                  '!**/features/*/index.ts',
                  '!**/routes/*/index.ts',
                ],
                message:
                  'Import the module through its public surface, for example `../../features/name-input` or `./features/greeting/index.ts` in the api.',
              },
            ],
          },
        ],
      },
    },
    {
      files: ['{apps,packages}/*/src/**/*.{ts,tsx}', 'showcase/*/*/src/**/*.{ts,tsx}'],
      excludeFiles: ['{apps,showcase/*}/web/src/main.tsx'],
      rules: { 'no-restricted-globals': ['error', 'document', 'window'] },
    },
  ],
};
