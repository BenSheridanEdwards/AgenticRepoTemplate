// ESLint owns policy rules, React hooks rules, React Compiler rules, and the
// React Doctor rules (ADR 0010, wiring in ADR 0015, local policy in ADR 0019).
// Biome owns formatting and general lint, so this config starts from no base
// rule set.
import reactDoctor from 'eslint-plugin-react-doctor';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';
import policy from './tooling/eslint-plugin-policy.js';

const reactHooksRecommended = reactHooks.configs.flat.recommended;
const reactDoctorRecommended = reactDoctor.configs.recommended;

// Each React Doctor rule below repeats a check another engine owns; the
// comment names that owner so every finding has exactly one source.
const singleOwnerOverrides = {
  'react-doctor/alt-text': 'off', // Biome a11y/useAltText
  'react-doctor/anchor-ambiguous-text': 'off', // Biome a11y/noAmbiguousAnchorText
  'react-doctor/anchor-has-content': 'off', // Biome a11y/useAnchorContent
  'react-doctor/anchor-is-valid': 'off', // Biome a11y/useValidAnchor
  'react-doctor/aria-activedescendant-has-tabindex': 'off', // Biome a11y/useAriaActivedescendantWithTabindex
  'react-doctor/aria-props': 'off', // Biome a11y/useValidAriaProps
  'react-doctor/aria-proptypes': 'off', // Biome a11y/useValidAriaValues
  'react-doctor/aria-role': 'off', // Biome a11y/useValidAriaRole
  'react-doctor/aria-unsupported-elements': 'off', // Biome a11y/noAriaUnsupportedElements
  'react-doctor/autocomplete-valid': 'off', // Biome a11y/useValidAutocomplete
  'react-doctor/button-has-type': 'off', // Biome a11y/useButtonType
  'react-doctor/click-events-have-key-events': 'off', // Biome a11y/useKeyWithClickEvents
  'react-doctor/heading-has-content': 'off', // Biome a11y/useHeadingContent
  'react-doctor/html-has-lang': 'off', // Biome a11y/useHtmlLang
  'react-doctor/iframe-has-title': 'off', // Biome a11y/useIframeTitle
  'react-doctor/img-redundant-alt': 'off', // Biome a11y/noRedundantAlt
  'react-doctor/interactive-supports-focus': 'off', // Biome a11y/useFocusableInteractive
  'react-doctor/label-has-associated-control': 'off', // Biome a11y/noLabelWithoutControl
  'react-doctor/lang': 'off', // Biome a11y/useValidLang
  'react-doctor/media-has-caption': 'off', // Biome a11y/useMediaCaption
  'react-doctor/mouse-events-have-key-events': 'off', // Biome a11y/useKeyWithMouseEvents
  'react-doctor/no-access-key': 'off', // Biome a11y/noAccessKey
  'react-doctor/no-aria-hidden-on-focusable': 'off', // Biome a11y/noAriaHiddenOnFocusable
  'react-doctor/no-autofocus': 'off', // Biome a11y/noAutofocus
  'react-doctor/no-distracting-elements': 'off', // Biome a11y/noDistractingElements
  'react-doctor/no-interactive-element-to-noninteractive-role': 'off', // Biome a11y/noInteractiveElementToNoninteractiveRole
  'react-doctor/no-noninteractive-element-to-interactive-role': 'off', // Biome a11y/noNoninteractiveElementToInteractiveRole
  'react-doctor/no-noninteractive-tabindex': 'off', // Biome a11y/noNoninteractiveTabindex
  'react-doctor/no-redundant-roles': 'off', // Biome a11y/noRedundantRoles
  'react-doctor/no-static-element-interactions': 'off', // Biome a11y/noStaticElementInteractions
  'react-doctor/prefer-tag-over-role': 'off', // Biome a11y/useSemanticElements
  'react-doctor/role-has-required-aria-props': 'off', // Biome a11y/useAriaPropsForRole
  'react-doctor/role-supports-aria-props': 'off', // Biome a11y/useAriaPropsSupportedByRole
  'react-doctor/scope': 'off', // Biome a11y/noHeaderScope
  'react-doctor/tabindex-no-positive': 'off', // Biome a11y/noPositiveTabindex
  'react-doctor/jsx-key': 'off', // Biome correctness/useJsxKeyInIterable
  'react-doctor/no-render-return-value': 'off', // Biome correctness/noRenderReturnValue
  'react-doctor/void-dom-elements-no-children': 'off', // Biome correctness/noVoidElementsWithChildren
  'react-doctor/no-spread-accumulator-in-reduce': 'off', // Biome performance/noAccumulatingSpread
  'react-doctor/jsx-no-script-url': 'off', // Biome security/noScriptUrl
  'react-doctor/jsx-no-target-blank': 'off', // Biome security/noBlankTarget
  'react-doctor/no-danger-with-children': 'off', // Biome security/noDangerouslySetInnerHtmlWithChildren
  'react-doctor/no-eval': 'off', // Biome security/noGlobalEval
  'react-doctor/no-non-null-assertion-on-maybe-undefined-result': 'off', // Biome style/noNonNullAssertion
  'react-doctor/jsx-no-comment-textnodes': 'off', // Biome suspicious/noCommentText
  'react-doctor/jsx-no-duplicate-props': 'off', // Biome suspicious/noDuplicateJsxProps
  'react-doctor/no-array-index-as-key': 'off', // Biome suspicious/noArrayIndexKey
  'react-doctor/rules-of-hooks': 'off', // react-hooks/rules-of-hooks
  'react-doctor/exhaustive-deps': 'off', // react-hooks/exhaustive-deps
  'react-doctor/no-set-state-in-render': 'off', // react-hooks/set-state-in-render
  'react-doctor/no-derived-state-effect': 'off', // react-hooks/set-state-in-effect
  'react-doctor/no-ref-current-in-render': 'off', // react-hooks/refs
  'react-doctor/no-nested-component-definition': 'off', // react-hooks/static-components
  'react-doctor/no-unstable-nested-components': 'off', // react-hooks/static-components
};

const policyRules = {
  ...Object.fromEntries(Object.keys(policy.rules).map((rule) => [`policy/${rule}`, 'error'])),
  'react-doctor/prefer-function-component': 'error',
  // A feature, route, shared module or the api client is imported only through
  // its index.ts.
  // The api names that file with its `.ts` extension, because NodeNext
  // resolution has no directory imports.
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
};

export default [
  {
    ignores: [
      '**/dist/**',
      'coverage/**',
      'vendor/**',
      'playwright-report/**',
      'test-results/**',
      'graphify-out/**',
      '.architect-audits/**',
      '.cache/**',
    ],
  },
  {
    // ESLint ignores every inline config comment (`eslint-disable*`,
    // `/* eslint <rule>: off */`, `/* global */`) and warns on each one, which
    // `--max-warnings=0` turns into a failure (ADR 0039). An exception goes in
    // this file with its reason.
    linterOptions: { noInlineConfig: true },
  },
  {
    // Parse every TypeScript and JSX file, so tests, e2e specs, tooling and
    // scripts are linted for inline config too. ESLint lints the other
    // JavaScript extensions by default.
    files: ['**/*.{ts,tsx,mts,cts,jsx}'],
    languageOptions: { parser: tseslint.parser },
  },
  {
    // Every package source file of every result: apps/web, apps/api,
    // packages/ui and each showcase/<id>/{web,api}.
    files: ['{apps,packages}/*/src/**/*.{ts,tsx}', 'showcase/*/*/src/**/*.{ts,tsx}'],
    languageOptions: { parser: tseslint.parser },
    plugins: {
      ...reactHooksRecommended.plugins,
      ...reactDoctorRecommended.plugins,
      policy,
    },
    settings: reactDoctorRecommended.settings,
    rules: {
      ...reactHooksRecommended.rules,
      ...reactDoctorRecommended.rules,
      ...singleOwnerOverrides,
      ...policyRules,
    },
  },
  {
    // Gate and tooling scripts ask the tool, or `matchesGlob`, which files a
    // glob covers (ADR 0041). A copy of the matching rules drifts from the tool.
    // Tests hold tool config such as Biome's `'**'` as data. A template counts
    // only with no substitutions, so Markdown bold (`**${text}**`) passes.
    files: ['scripts/**/*.{js,mjs,cjs,ts,mts}', 'tooling/**/*.{js,mjs,cjs,ts,mts}'],
    ignores: ['**/*.test.ts', '**/*.spec.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...['**', '**/'].flatMap((wildcard) =>
          [
            `Literal[value='${wildcard}']`,
            `TemplateLiteral[expressions.length=0] > TemplateElement[value.cooked='${wildcard}']`,
          ].map((selector) => ({
            selector,
            message:
              "Match globs with `matchesGlob` from 'node:path', or ask the tool for its file list (`fallow config`, `jest --listTests`). A hand-written glob translator drifts from the tool (ADR 0041).",
          })),
        ),
      ],
    },
  },
];
