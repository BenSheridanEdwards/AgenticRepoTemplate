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

const loopSelectors = [
  {
    selector: 'ForStatement',
    message:
      '[ForStatement] Prefer declarative iteration: map/filter/reduce/flatMap/some/every/find/Object.entries/Array.from instead of a for loop.',
  },
  {
    selector: 'ForInStatement',
    message:
      '[ForInStatement] Prefer Object.keys/Object.entries with map/filter/reduce/flatMap/some/every/find/Array.from instead of for...in.',
  },
  {
    selector: 'ForOfStatement[await=false]',
    message:
      '[ForOfStatement] Prefer map/filter/reduce/flatMap/some/every/find/Object.entries/Array.from instead of for...of.',
  },
  {
    selector: 'WhileStatement',
    message:
      '[WhileStatement] Prefer declarative iteration (map/filter/reduce/flatMap/some/every/find/Object.entries/Array.from) instead of while.',
  },
  {
    selector: 'DoWhileStatement',
    message:
      '[DoWhileStatement] Prefer declarative iteration (map/filter/reduce/flatMap/some/every/find/Object.entries/Array.from) instead of do...while.',
  },
];

const policyRules = {
  ...Object.fromEntries(Object.keys(policy.rules).map((rule) => [`policy/${rule}`, 'error'])),
  'react-doctor/prefer-function-component': 'error',
  // Sarah Fim's anti-slop `max-depth` 4: a block nested deeper than four reads
  // as slop (NORTH_STAR §1). The core rule owns the deterministic nesting limit;
  // Fallow owns statistical complexity and never gates nesting depth (ADR 0050).
  'max-depth': ['error', 4],
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
    // Parameter updates return copies instead of mutating callers (ADR 0079, I11).
    files: ['**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'],
    rules: {
      'no-param-reassign': ['error', { props: true }],
      'no-restricted-syntax': ['error', ...loopSelectors],
    },
  },
  {
    ignores: [
      '**/dist/**',
      'coverage/**',
      'vendor/**',
      'playwright-report/**',
      'test-results/**',
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
      'react-hooks/exhaustive-deps': 'error',
      'react-hooks/incompatible-library': 'error',
      'react-hooks/unsupported-syntax': 'error',
      'react-doctor/advanced-event-handler-refs': 'error',
      'react-doctor/anchor-target-exists': 'error',
      'react-doctor/async-await-in-loop': 'error',
      'react-doctor/async-defer-await': 'error',
      'react-doctor/async-parallel': 'error',
      'react-doctor/auth-token-in-web-storage': 'error',
      'react-doctor/base-ui-dialog-popup-requires-title': 'off',
      'react-doctor/base-ui-field-requires-label': 'off',
      'react-doctor/base-ui-tabs-tab-requires-list': 'off',
      'react-doctor/checked-requires-onchange-or-readonly': 'error',
      'react-doctor/class-component-missing-component-will-unmount-teardown': 'error',
      'react-doctor/client-passive-event-listeners': 'error',
      'react-doctor/context-provider-value-from-unmemoized-local-literal': 'error',
      'react-doctor/control-has-associated-label': 'error',
      'react-doctor/debounce-no-cleanup': 'error',
      'react-doctor/dialog-has-accessible-name': 'error',
      'react-doctor/effect-raf-loop-needs-cancel': 'error',
      'react-doctor/forbid-dom-props': 'error',
      'react-doctor/forbid-elements': 'error',
      'react-doctor/forward-ref-uses-ref': 'error',
      'react-doctor/hook-import-rename-loses-use-prefix': 'error',
      'react-doctor/html-label-has-single-control': 'error',
      'react-doctor/html-no-invalid-paragraph-child': 'error',
      'react-doctor/html-no-invalid-table-nesting': 'error',
      'react-doctor/html-no-nested-form': 'error',
      'react-doctor/html-no-nested-interactive': 'error',
      'react-doctor/iframe-missing-sandbox': 'error',
      'react-doctor/ink-no-multiple-static': 'off',
      'react-doctor/ink-prefer-use-animation': 'off',
      'react-doctor/ink-static-is-append-only': 'off',
      'react-doctor/ink-use-reactive-window-size': 'off',
      'react-doctor/ink-use-string-width-for-cursor': 'off',
      'react-doctor/jotai-derived-atom-returns-fresh-object': 'off',
      'react-doctor/jotai-tq-use-raw-query-atom': 'off',
      'react-doctor/js-async-reduce-without-awaited-acc': 'error',
      'react-doctor/js-batch-dom-css': 'error',
      'react-doctor/js-cache-storage': 'error',
      'react-doctor/js-hoist-intl': 'error',
      'react-doctor/js-hoist-regexp': 'error',
      'react-doctor/js-index-maps': 'error',
      'react-doctor/js-min-max-loop': 'error',
      'react-doctor/js-set-map-lookups': 'error',
      'react-doctor/jsx-no-constructed-context-values': 'error',
      'react-doctor/jsx-no-jsx-as-prop': 'error',
      'react-doctor/jsx-no-new-array-as-prop': 'error',
      'react-doctor/jsx-no-new-function-as-prop': 'error',
      'react-doctor/jsx-no-new-object-as-prop': 'error',
      'react-doctor/jsx-numeric-and-leaked-render': 'error',
      'react-doctor/jsx-props-no-spread-multi': 'error',
      'react-doctor/mobx-reaction-disposer-discarded': 'off',
      'react-doctor/motion-animate-presence-must-outlive-child': 'off',
      'react-doctor/motion-animate-presence-requires-key': 'off',
      'react-doctor/motion-animate-presence-wait-single-child': 'off',
      'react-doctor/motion-create-in-render': 'off',
      'react-doctor/motion-drag-axis-constraint-mismatch': 'off',
      'react-doctor/motion-layout-on-inline-element': 'off',
      'react-doctor/motion-unstable-layout-id-in-iteration': 'off',
      'react-doctor/motion-value-constructor-in-render': 'off',
      'react-doctor/no-adjust-state-on-prop-change': 'error',
      'react-doctor/no-arithmetic-on-optional-chained-operand': 'error',
      'react-doctor/no-array-find-result-member-access-without-guard': 'error',
      'react-doctor/no-array-index-deref-without-bounds-or-empty-guard': 'error',
      'react-doctor/no-assertive-status': 'error',
      'react-doctor/no-async-effect-callback': 'error',
      'react-doctor/no-async-event-handler-without-reentry-guard': 'error',
      'react-doctor/no-autoplay-without-muted': 'error',
      'react-doctor/no-boolean-toggle-without-functional-update': 'error',
      'react-doctor/no-broken-image-source': 'error',
      'react-doctor/no-call-component-as-function': 'error',
      'react-doctor/no-chain-state-updates': 'error',
      'react-doctor/no-collapsed-literal-or-chain-as-value': 'error',
      'react-doctor/no-conflicting-spring-options': 'off',
      'react-doctor/no-controlled-input-value-without-state-update': 'error',
      'react-doctor/no-create-object-url-in-render': 'error',
      'react-doctor/no-create-object-url-without-revoke': 'error',
      'react-doctor/no-create-ref-in-function-component': 'error',
      'react-doctor/no-default-props': 'error',
      'react-doctor/no-deprecated-keyboard-event-keycode-which': 'error',
      'react-doctor/no-derived-state': 'error',
      'react-doctor/no-derived-useState': 'error',
      'react-doctor/no-did-mount-set-state': 'error',
      'react-doctor/no-did-update-set-state': 'error',
      'react-doctor/no-direct-state-mutation': 'error',
      'react-doctor/no-document-start-view-transition': 'error',
      'react-doctor/no-document-write': 'error',
      'react-doctor/no-dynamic-import-path': 'error',
      'react-doctor/no-eager-new-in-use-state-initializer': 'error',
      'react-doctor/no-effect-chain': 'error',
      'react-doctor/no-effect-event-handler': 'error',
      'react-doctor/no-effect-wrapper-discards-callback-cleanup-return': 'error',
      'react-doctor/no-enter-submit-without-ime-composition-guard': 'error',
      'react-doctor/no-event-handler': 'error',
      'react-doctor/no-event-trigger-state': 'error',
      'react-doctor/no-fetch-in-effect': 'error',
      'react-doctor/no-fetch-response-used-without-status-check': 'error',
      'react-doctor/no-fill-map-element-as-key': 'error',
      'react-doctor/no-find-dom-node': 'error',
      'react-doctor/no-floating-then-in-jsx-handler': 'error',
      'react-doctor/no-flush-sync': 'error',
      'react-doctor/no-focusable-content-in-aria-hidden': 'error',
      'react-doctor/no-full-lodash-import': 'error',
      'react-doctor/no-giant-component': 'error',
      'react-doctor/no-high-complexity-react-function': 'error',
      'react-doctor/no-img-lazy-with-high-fetchpriority': 'error',
      'react-doctor/no-indeterminate-attribute': 'error',
      'react-doctor/no-initialize-state': 'error',
      'react-doctor/no-inline-hoc-on-component': 'error',
      'react-doctor/no-inline-prop-on-memo-component': 'error',
      'react-doctor/no-is-mounted': 'error',
      'react-doctor/no-json-parse-stringify-clone': 'error',
      'react-doctor/no-large-animated-blur': 'error',
      'react-doctor/no-loading-flag-reset-outside-finally': 'error',
      'react-doctor/no-locale-format-in-render': 'error',
      'react-doctor/no-match-media-in-state-initializer': 'error',
      'react-doctor/no-mirror-prop-effect': 'error',
      'react-doctor/no-mixed-srcset-descriptors': 'error',
      'react-doctor/no-moment': 'error',
      'react-doctor/no-multiple-main-landmarks': 'error',
      'react-doctor/no-multiple-unlabeled-navigation-landmarks': 'error',
      'react-doctor/no-mutate-queried-dom-node-in-component': 'error',
      'react-doctor/no-mutate-then-set-or-return-same-reference': 'error',
      'react-doctor/no-mutating-array-method-on-prop-or-hook-result': 'error',
      'react-doctor/no-namespace': 'error',
      'react-doctor/no-non-literal-selector-query-without-try-catch': 'error',
      'react-doctor/no-nondeterministic-id-value-in-render-body': 'error',
      'react-doctor/no-noninteractive-element-interactions': 'error',
      'react-doctor/no-nullish-coalescing-arithmetic-precedence': 'error',
      'react-doctor/no-object-keys-values-entries-on-maybe-undefined': 'error',
      'react-doctor/no-object-or-array-coerced-to-string-in-template-literal': 'error',
      'react-doctor/no-pass-data-to-parent': 'error',
      'react-doctor/no-pass-live-state-to-parent': 'error',
      'react-doctor/no-path-prefix-containment': 'error',
      'react-doctor/no-permanent-will-change': 'error',
      'react-doctor/no-placeholder-only-field': 'error',
      'react-doctor/no-predicate-function-reference-in-boolean-position': 'error',
      'react-doctor/no-prevent-default': 'error',
      'react-doctor/no-promise-then-side-effect-in-effect-without-catch': 'error',
      'react-doctor/no-prop-callback-in-effect': 'error',
      'react-doctor/no-react-dom-deprecated-apis': 'error',
      'react-doctor/no-react19-deprecated-apis': 'error',
      'react-doctor/no-redundant-should-component-update': 'error',
      'react-doctor/no-ref-callback-cleanup-before-react-19': 'error',
      'react-doctor/no-render-in-render': 'error',
      'react-doctor/no-reset-all-state-on-prop-change': 'error',
      'react-doctor/no-responsive-hidden-accessible-name': 'error',
      'react-doctor/no-secrets-in-client-code': 'error',
      'react-doctor/no-self-updating-effect': 'error',
      'react-doctor/no-set-state-after-await-in-effect': 'error',
      'react-doctor/no-side-effect-in-state-updater-function': 'error',
      'react-doctor/no-spread-props-over-defaults-clobbers-with-undefined': 'error',
      'react-doctor/no-srcset-without-sizes': 'error',
      'react-doctor/no-stale-timer-ref': 'error',
      'react-doctor/no-static-motion-config-never': 'off',
      'react-doctor/no-string-false-on-boolean-attribute': 'error',
      'react-doctor/no-string-refs': 'error',
      'react-doctor/no-sync-xhr': 'error',
      'react-doctor/no-this-in-sfc': 'error',
      'react-doctor/no-transition-all': 'error',
      'react-doctor/no-uncontrolled-input': 'error',
      'react-doctor/no-undeferred-third-party': 'error',
      'react-doctor/no-unescaped-dynamic-string-in-regexp': 'error',
      'react-doctor/no-unguarded-browser-global-at-module-scope': 'error',
      'react-doctor/no-unguarded-numeric-input-parse': 'error',
      'react-doctor/no-unguarded-throwing-parse-call': 'error',
      'react-doctor/no-uninformative-aria-label': 'error',
      'react-doctor/no-unknown-property': 'error',
      'react-doctor/no-unowned-async-error-clear': 'error',
      'react-doctor/no-unsafe': 'error',
      'react-doctor/no-unsafe-json-parse': 'error',
      'react-doctor/no-unthrottled-scroll-mutation': 'error',
      'react-doctor/no-whole-object-default-losing-per-key-defaults': 'error',
      'react-doctor/no-whole-object-dep-with-member-reads': 'error',
      'react-doctor/no-will-update-set-state': 'error',
      'react-doctor/only-export-components': 'error',
      'react-doctor/pointer-capture-needs-cancel-handler': 'error',
      'react-doctor/prefer-dynamic-import': 'error',
      'react-doctor/prefer-html-dialog': 'error',
      'react-doctor/prefer-stable-empty-fallback': 'error',
      'react-doctor/prefer-use-effect-event': 'error',
      'react-doctor/prefer-use-sync-external-store': 'error',
      'react-doctor/r3f-cap-device-pixel-ratio': 'off',
      'react-doctor/r3f-limit-shadowed-point-lights': 'off',
      'react-doctor/r3f-no-advancing-clock-in-use-frame': 'off',
      'react-doctor/r3f-no-allocation-in-pointer-move': 'off',
      'react-doctor/r3f-no-async-use-frame': 'off',
      'react-doctor/r3f-no-clone-in-use-frame': 'off',
      'react-doctor/r3f-no-deep-use-three-selector': 'off',
      'react-doctor/r3f-no-dispose-loader-cache': 'off',
      'react-doctor/r3f-no-duplicate-primitive-object': 'off',
      'react-doctor/r3f-no-extend-in-render': 'off',
      'react-doctor/r3f-no-extend-three-namespace': 'off',
      'react-doctor/r3f-no-fresh-portal-container': 'off',
      'react-doctor/r3f-no-fresh-use-three-selector': 'off',
      'react-doctor/r3f-no-ignored-basic-material-properties': 'off',
      'react-doctor/r3f-no-ignored-linewidth': 'off',
      'react-doctor/r3f-no-inline-primitive-object': 'off',
      'react-doctor/r3f-no-inline-resource-prop': 'off',
      'react-doctor/r3f-no-internal-imports': 'off',
      'react-doctor/r3f-no-manual-canvas-resize': 'off',
      'react-doctor/r3f-no-mutate-loader-cache': 'off',
      'react-doctor/r3f-no-mutating-pointer-event-data': 'off',
      'react-doctor/r3f-no-new-in-use-frame': 'off',
      'react-doctor/r3f-no-normalized-float-buffer-attribute': 'off',
      'react-doctor/r3f-no-null-loader-input': 'off',
      'react-doctor/r3f-no-recursive-raf-with-use-frame': 'off',
      'react-doctor/r3f-no-shadows-on-unsupported-light': 'off',
      'react-doctor/r3f-no-state-in-pointer-move': 'off',
      'react-doctor/r3f-no-state-in-use-frame': 'off',
      'react-doctor/r3f-no-sync-readback-in-use-frame': 'off',
      'react-doctor/r3f-no-unstable-args': 'off',
      'react-doctor/r3f-no-use-frame-dependency-array': 'off',
      'react-doctor/r3f-prefer-gpu-instanced-animation': 'off',
      'react-doctor/r3f-prefer-gpu-position-animation': 'off',
      'react-doctor/r3f-prefer-instanced-mesh': 'off',
      'react-doctor/r3f-prefer-use-loader': 'off',
      'react-doctor/r3f-require-dynamic-buffer-usage': 'off',
      'react-doctor/r3f-require-environment-for-metal': 'off',
      'react-doctor/r3f-require-frame-delta': 'off',
      'react-doctor/r3f-require-global-effect-cleanup': 'off',
      'react-doctor/r3f-require-lighting-for-pbr': 'off',
      'react-doctor/r3f-require-owned-texture-cleanup': 'off',
      'react-doctor/r3f-require-render-with-positive-priority': 'off',
      'react-doctor/r3f-require-root-unmount': 'off',
      'react-doctor/r3f-require-shadows-enabled': 'off',
      'react-doctor/r3f-require-transparent-for-opacity': 'off',
      'react-doctor/r3f-texture-repeat-requires-wrapping': 'off',
      'react-doctor/r3f-valid-material-opacity': 'off',
      'react-doctor/r3f-valid-pbr-material-properties': 'off',
      'react-doctor/r3f-valid-physical-material-properties': 'off',
      'react-doctor/r3f-valid-shadow-map-size': 'off',
      'react-doctor/r3f-valid-spot-light-properties': 'off',
      'react-doctor/r3f-webgpu-no-gl-state': 'off',
      'react-doctor/r3f-webgpu-no-js-uniform-branch': 'off',
      'react-doctor/radio-input-missing-name': 'error',
      'react-doctor/radix-dialog-content-requires-title': 'off',
      'react-doctor/radix-tabs-trigger-requires-list': 'off',
      'react-doctor/react-aria-dialog-requires-heading': 'off',
      'react-doctor/react-markdown-unsanitized-raw-html': 'off',
      'react-doctor/react-router-guard-aborted-handle-error': 'off',
      'react-doctor/react-router-internal-route-anchor': 'off',
      'react-doctor/react-router-loader-fetch-forwards-signal': 'off',
      'react-doctor/react-router-loader-parallel-fetch': 'off',
      'react-doctor/react-router-no-catch-middleware-next': 'off',
      'react-doctor/react-router-no-empty-leaf-route': 'off',
      'react-doctor/react-router-no-middleware-response-body-consumption': 'off',
      'react-doctor/react-router-no-multiple-set-search-params-in-tick': 'off',
      'react-doctor/react-router-prefer-route-lazy': 'off',
      'react-doctor/react-router-return-navigation-promise-in-transition': 'off',
      'react-doctor/redux-useselector-inline-derivation': 'off',
      'react-doctor/redux-useselector-returns-new-collection': 'off',
      'react-doctor/rendering-conditional-render': 'error',
      'react-doctor/rendering-hydration-mismatch-time': 'error',
      'react-doctor/rendering-hydration-no-flicker': 'error',
      'react-doctor/rendering-script-defer-async': 'error',
      'react-doctor/rerender-defer-reads-hook': 'error',
      'react-doctor/rerender-derived-state-from-hook': 'error',
      'react-doctor/rerender-functional-setstate': 'error',
      'react-doctor/rerender-lazy-ref-init': 'error',
      'react-doctor/rerender-lazy-state-init': 'error',
      'react-doctor/rerender-memo-before-early-return': 'error',
      'react-doctor/rerender-memo-with-default-value': 'error',
      'react-doctor/rerender-state-only-in-handlers': 'error',
      'react-doctor/rerender-transitions-scroll': 'error',
      'react-doctor/role-button-requires-complete-keyboard-activation': 'error',
      'react-doctor/server-after-nonblocking': 'off',
      'react-doctor/server-cache-with-object-literal': 'off',
      'react-doctor/server-fetch-without-revalidate': 'off',
      'react-doctor/server-hoist-static-io': 'off',
      'react-doctor/server-sequential-independent-await': 'off',
      'react-doctor/shadcn-command-item-state-variant-requires-value': 'off',
      'react-doctor/shadcn-dialog-content-requires-title': 'off',
      'react-doctor/shadcn-form-item-requires-label': 'off',
      'react-doctor/shadcn-icon-button-requires-label': 'off',
      'react-doctor/shadcn-input-group-no-raw-controls': 'off',
      'react-doctor/shadcn-tabs-trigger-requires-list': 'off',
      'react-doctor/style-prop-object': 'error',
      'react-doctor/styled-components-non-transient-custom-prop-on-intrinsic-element': 'off',
      'react-doctor/tanstack-form-on-submit-requires-prevent-default': 'off',
      'react-doctor/tanstack-table-no-unstable-data-or-columns': 'off',
      'react-doctor/tanstack-virtual-measure-element-requires-data-index': 'off',
      'react-doctor/three-cap-device-pixel-ratio': 'off',
      'react-doctor/three-limit-shadowed-point-lights': 'off',
      'react-doctor/three-no-allocation-in-pointer-move': 'off',
      'react-doctor/three-no-async-animation-loop': 'off',
      'react-doctor/three-no-clone-in-animation-loop': 'off',
      'react-doctor/three-no-ignored-basic-material-properties': 'off',
      'react-doctor/three-no-ignored-linewidth': 'off',
      'react-doctor/three-no-new-in-animation-loop': 'off',
      'react-doctor/three-no-normalized-float-buffer-attribute': 'off',
      'react-doctor/three-no-object-construction-in-render': 'off',
      'react-doctor/three-no-redundant-uniforms-need-update': 'off',
      'react-doctor/three-no-shadows-on-unsupported-light': 'off',
      'react-doctor/three-no-state-in-animation-loop': 'off',
      'react-doctor/three-no-state-in-pointer-move': 'off',
      'react-doctor/three-no-sync-readback-in-animation-loop': 'off',
      'react-doctor/three-no-unconditional-renderer-resize-in-animation-loop': 'off',
      'react-doctor/three-prefer-gpu-instanced-animation': 'off',
      'react-doctor/three-prefer-gpu-position-animation': 'off',
      'react-doctor/three-prefer-instanced-mesh': 'off',
      'react-doctor/three-prefer-set-animation-loop': 'off',
      'react-doctor/three-require-animation-mixer-cleanup': 'off',
      'react-doctor/three-require-controls-cleanup': 'off',
      'react-doctor/three-require-controls-update': 'off',
      'react-doctor/three-require-dynamic-buffer-usage': 'off',
      'react-doctor/three-require-environment-for-metal': 'off',
      'react-doctor/three-require-frame-delta': 'off',
      'react-doctor/three-require-gpu-computation-cleanup': 'off',
      'react-doctor/three-require-lighting-for-pbr': 'off',
      'react-doctor/three-require-loader-error-handling': 'off',
      'react-doctor/three-require-owned-geometry-cleanup': 'off',
      'react-doctor/three-require-owned-material-cleanup': 'off',
      'react-doctor/three-require-owned-texture-cleanup': 'off',
      'react-doctor/three-require-postprocessing-cleanup': 'off',
      'react-doctor/three-require-render-target-cleanup': 'off',
      'react-doctor/three-require-renderer-cleanup': 'off',
      'react-doctor/three-require-renderer-dom-attachment': 'off',
      'react-doctor/three-require-renderer-size': 'off',
      'react-doctor/three-require-shadows-enabled': 'off',
      'react-doctor/three-require-transparent-for-opacity': 'off',
      'react-doctor/three-require-worker-loader-cleanup': 'off',
      'react-doctor/three-shader-no-inverse-of-uniform': 'off',
      'react-doctor/three-shader-no-redundant-frag-depth': 'off',
      'react-doctor/three-shader-prefer-small-integer-pow': 'off',
      'react-doctor/three-shader-prefer-squared-distance-comparison': 'off',
      'react-doctor/three-texture-repeat-requires-wrapping': 'off',
      'react-doctor/three-tsl-no-js-uniform-branch': 'off',
      'react-doctor/three-valid-material-opacity': 'off',
      'react-doctor/three-valid-pbr-material-properties': 'off',
      'react-doctor/three-valid-physical-material-properties': 'off',
      'react-doctor/three-valid-shadow-map-size': 'off',
      'react-doctor/three-valid-spot-light-properties': 'off',
      'react-doctor/use-lazy-motion': 'off',
      'react-doctor/valtio-no-proxy-read-in-render': 'off',
      'react-doctor/valtio-no-snapshot-in-callback': 'off',
      'react-doctor/webgl-no-sync-readback-in-animation-loop': 'off',
      'react-doctor/window-open-without-noopener': 'error',
      'react-doctor/zod-v4-no-deprecated-error-apis': 'off',
      'react-doctor/zod-v4-no-deprecated-error-customization': 'off',
      'react-doctor/zod-v4-no-deprecated-schema-apis': 'off',
      'react-doctor/zustand-no-whole-store-destructure': 'off',
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
        ...loopSelectors,
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
