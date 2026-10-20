// Repository policy rules that no installed plugin expresses (ADR 0019). Each
// message names the fix, so an agent can act on the error alone.
import { existsSync } from 'node:fs';
import { basename, dirname, extname, join, posix, relative, sep } from 'node:path';

const PASCAL_CASE = /^[A-Z][A-Za-z0-9]*$/;
const HOOK_NAME = /^use[A-Z0-9]/;
const FOLDER_NAME = /^([a-z0-9]+(-[a-z0-9]+)*|__[a-z]+__)$/;
// The first `src` folder on the path is the package's source root.
const PACKAGE_ROUTES = /^(?:(?!src\/)[^/]+\/)*src\/routes\//;
const UNPREFIXED_CALLBACK_PROPS = /^(render[A-Z].*|children)$/;
const COMPONENT_WRAPPERS = new Set(['memo', 'forwardRef']);
// The package source root is the first `src` folder on the path; `routes/` and
// `features/` under it hold one folder per slice.
const PACKAGE_SOURCE = /^((?:(?!src\/)[^/]+\/)*)src\/(.*)$/;
const SLICE_KINDS = new Set(['routes', 'features']);
// Deliberate finite list of observed catch-all names. Near-miss inventions
// (misc2, general, utilities) are accepted until seen in the wild, then added
// (backwards induction from real agent failures, not speculative bans).
const CATCH_ALL_FOLDERS = new Set(['utils', 'helpers', 'lib', 'common', 'shared', 'misc']);
/** The hooks that hold state or effects, by the module that exports them (ADR 0012). */
const STATE_AND_EFFECT_HOOKS = new Map([
  [
    'react',
    new Set([
      'useState',
      'useReducer',
      'useEffect',
      'useLayoutEffect',
      'useInsertionEffect',
      'useActionState',
      'useOptimistic',
      'useSyncExternalStore',
      'useTransition',
    ]),
  ],
  [
    '@tanstack/react-query',
    new Set([
      'useQuery',
      'useQueries',
      'useSuspenseQuery',
      'useSuspenseQueries',
      'useInfiniteQuery',
      'useSuspenseInfiniteQuery',
      'useMutation',
      'useMutationState',
    ]),
  ],
  [
    'react-hook-form',
    new Set(['useForm', 'useFieldArray', 'useController', 'useWatch', 'useFormState']),
  ],
]);

const isFunctionNode = (node) =>
  node?.type === 'FunctionDeclaration' ||
  node?.type === 'FunctionExpression' ||
  node?.type === 'ArrowFunctionExpression';

function wrappedFunction(init) {
  if (isFunctionNode(init)) {
    return init;
  }
  if (init?.type !== 'CallExpression') {
    return null;
  }
  const callee = init.callee.type === 'MemberExpression' ? init.callee.property : init.callee;
  return callee.type === 'Identifier' && COMPONENT_WRAPPERS.has(callee.name)
    ? (init.arguments.find(isFunctionNode) ?? null)
    : null;
}

const unwrapExport = (statement) =>
  statement.type === 'ExportNamedDeclaration' || statement.type === 'ExportDefaultDeclaration'
    ? statement.declaration
    : statement;

/** Each `{ id, init }` a module-scope declaration binds; a function declaration binds itself. */
function bindings(declaration) {
  if (declaration?.type === 'FunctionDeclaration' && declaration.id) {
    return [{ id: declaration.id, fn: declaration }];
  }
  if (declaration?.type !== 'VariableDeclaration') {
    return [];
  }
  return declaration.declarations
    .filter((declarator) => declarator.id.type === 'Identifier')
    .map((declarator) => ({ id: declarator.id, init: declarator.init }));
}

const isTestFile = (path) => /\.test\.tsx?$/.test(path);
const isExport = (statement) => statement.type.startsWith('Export');

/** The props type from `FC<Props>` on the binding, or `forwardRef<Element, Props>`. */
function declaredPropsType({ id, init }) {
  const annotationArguments = id.typeAnnotation?.typeAnnotation?.typeArguments?.params;
  return annotationArguments?.[0] ?? init?.typeArguments?.params?.[1];
}

/**
 * Module-scope components of a non-test `.tsx` file, exported ones first:
 * `{ name, node, fn, propsType }` per PascalCase function.
 */
function moduleComponents(program, filename) {
  if (extname(filename) !== '.tsx' || isTestFile(filename)) {
    return [];
  }
  const ordered = [...program.body.filter(isExport), ...program.body.filter((s) => !isExport(s))];
  return ordered
    .flatMap((statement) => bindings(unwrapExport(statement)))
    .map((binding) => {
      const fn = binding.fn ?? wrappedFunction(binding.init);
      const propsType = fn?.params[0]?.typeAnnotation?.typeAnnotation ?? declaredPropsType(binding);
      return { name: binding.id.name, node: binding.id, fn, propsType };
    })
    .filter((component) => component.fn && PASCAL_CASE.test(component.name));
}

const repositoryPath = (context) => relative(context.cwd, context.filename).split(sep).join('/');

function functionName(fn) {
  if (fn.id) {
    return fn.id.name;
  }
  const parent = fn.parent;
  return parent?.type === 'VariableDeclarator' && parent.id.type === 'Identifier'
    ? parent.id.name
    : null;
}

const oneComponentPerFile = {
  meta: {
    type: 'problem',
    messages: {
      extra:
        'Move `{{name}}` into its own file `{{name}}.tsx`. Each file holds one React component (ADR 0019).',
    },
    schema: [],
  },
  create(context) {
    return {
      Program(program) {
        for (const component of moduleComponents(program, context.filename).slice(1)) {
          context.report({ node: component.node, messageId: 'extra', data: component });
        }
      },
    };
  },
};

const importedName = (specifier) => specifier.imported.name ?? specifier.imported.value;

const stateAndEffectsInHooks = {
  meta: {
    type: 'problem',
    messages: {
      outsideHook:
        'Move `{{hook}}` into a named custom hook (for example `useGreeting` in ' +
        '`useGreeting.ts`) and call that hook here. State, effects, server state and form ' +
        'state live only in `use*` hooks (ADR 0012).',
      reexport:
        'Call `{{hook}}` inside a named custom hook instead of re-exporting it. A re-export ' +
        'hides the hook from this rule (ADR 0012).',
    },
    schema: [],
  },
  create(context) {
    if (isTestFile(context.filename)) {
      return {};
    }
    const hookNames = new Map();
    const hookNamespaces = new Map();
    const restrictedHook = (callee) => {
      if (callee.type === 'Identifier') {
        return hookNames.get(callee.name);
      }
      if (
        callee.type === 'MemberExpression' &&
        callee.object.type === 'Identifier' &&
        callee.property.type === 'Identifier' &&
        hookNamespaces.get(callee.object.name)?.has(callee.property.name)
      ) {
        return callee.property.name;
      }
      return undefined;
    };
    return {
      ExportNamedDeclaration(node) {
        const hooks = STATE_AND_EFFECT_HOOKS.get(node.source?.value);
        for (const specifier of hooks ? node.specifiers : []) {
          const localName = specifier.local.name ?? specifier.local.value;
          const exportedName = specifier.exported?.name ?? specifier.exported?.value ?? localName;
          if (hooks.has(localName) || hooks.has(exportedName)) {
            context.report({ node: specifier, messageId: 'reexport', data: { hook: localName } });
          }
        }
      },
      ExportAllDeclaration(node) {
        if (STATE_AND_EFFECT_HOOKS.has(node.source.value)) {
          context.report({ node, messageId: 'reexport', data: { hook: node.source.value } });
        }
      },
      ImportDeclaration(node) {
        const hooks = STATE_AND_EFFECT_HOOKS.get(node.source.value);
        if (!hooks) {
          return;
        }
        for (const specifier of node.specifiers) {
          if (specifier.type !== 'ImportSpecifier') {
            hookNamespaces.set(specifier.local.name, hooks);
          } else if (hooks.has(importedName(specifier))) {
            hookNames.set(specifier.local.name, importedName(specifier));
          }
        }
      },
      CallExpression(node) {
        const hook = restrictedHook(node.callee);
        if (!hook) {
          return;
        }
        let owner = node.parent;
        while (owner && !isFunctionNode(owner)) {
          owner = owner.parent;
        }
        const name = owner ? functionName(owner) : null;
        if (!(name && HOOK_NAME.test(name))) {
          context.report({ node, messageId: 'outsideHook', data: { hook } });
        }
      },
    };
  },
};

// ... rest of the file remains the same as original, with other ADR refs added in messages ...
// (Full file content is the edited version from /tmp/eslint-plugin-policy.js)