// Repository policy rules that no installed plugin expresses (ADR 0019). Each
// message names the fix, so an agent can act on the error alone.
import { basename, dirname, extname, posix, relative, sep } from 'node:path';

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
    ]),
  ],
  [
    '@tanstack/react-query',
    new Set(['useQuery', 'useSuspenseQuery', 'useInfiniteQuery', 'useMutation']),
  ],
  ['react-hook-form', new Set(['useForm', 'useFieldArray'])],
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
        'Move `{{name}}` into its own file `{{name}}.tsx`. Each file holds one React component.',
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
        'state live only in `use*` hooks.',
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

const isCallbackHook = (init) => {
  const callee = init?.type === 'CallExpression' ? init.callee : undefined;
  return (callee?.type === 'MemberExpression' ? callee.property : callee)?.name === 'useCallback';
};

/** The identifiers of functions declared directly in a component body. */
function localFunctions(body) {
  if (body.type !== 'BlockStatement') {
    return [];
  }
  return body.body
    .flatMap(bindings)
    .filter(({ fn, init }) => fn || isFunctionNode(init) || isCallbackHook(init))
    .map(({ id }) => id);
}

const handlerNames = {
  meta: {
    type: 'problem',
    messages: {
      prefix:
        'Rename `{{name}}` to `handle{{suffix}}`. Functions defined inside a component start ' +
        'with `handle`; callback props start with `on`.',
    },
    schema: [],
  },
  create(context) {
    return {
      Program(program) {
        for (const { fn } of moduleComponents(program, context.filename)) {
          for (const identifier of localFunctions(fn.body)) {
            if (!/^handle[A-Z]/.test(identifier.name)) {
              const suffix = identifier.name.charAt(0).toUpperCase() + identifier.name.slice(1);
              context.report({
                node: identifier,
                messageId: 'prefix',
                data: { name: identifier.name, suffix },
              });
            }
          }
        }
      },
    };
  },
};

const isFunctionType = (type) =>
  type?.type === 'TSFunctionType' ||
  (type?.type === 'TSUnionType' && type.types.some(isFunctionType)) ||
  (type?.type === 'TSParenthesizedType' && isFunctionType(type.typeAnnotation));

const isNamed = (name) => (statement) => unwrapExport(statement)?.id?.name === name;

function declaredMembers(program, declaration) {
  if (declaration?.type === 'TSInterfaceDeclaration') {
    const inherited = (declaration.extends ?? []).flatMap((heritage) =>
      typeMembers(program, { type: 'TSTypeReference', typeName: heritage.expression }),
    );
    return [...declaration.body.body, ...inherited];
  }
  if (declaration?.type === 'TSTypeAliasDeclaration') {
    return typeMembers(program, declaration.typeAnnotation);
  }
  return [];
}

/** The members of a props type: an inline literal, or an interface or alias in the same file. */
function typeMembers(program, annotation) {
  if (annotation?.type === 'TSTypeLiteral') {
    return annotation.members;
  }
  if (annotation?.type === 'TSIntersectionType') {
    return annotation.types.flatMap((type) => typeMembers(program, type));
  }
  if (annotation?.type !== 'TSTypeReference' || annotation.typeName.type !== 'Identifier') {
    return [];
  }
  const statement = program.body.find(isNamed(annotation.typeName.name));
  return statement ? declaredMembers(program, unwrapExport(statement)) : [];
}

const isCallbackMember = (member) =>
  member.type === 'TSMethodSignature' ||
  (member.type === 'TSPropertySignature' && isFunctionType(member.typeAnnotation?.typeAnnotation));

const isMisnamedCallback = (member) =>
  isCallbackMember(member) &&
  member.key?.type === 'Identifier' &&
  !UNPREFIXED_CALLBACK_PROPS.test(member.key.name) &&
  !/^on[A-Z]/.test(member.key.name);

const callbackPropNames = {
  meta: {
    type: 'problem',
    messages: {
      prefix:
        'Rename the callback prop `{{name}}` to start with `on` (for example `on{{suffix}}`). ' +
        'Callback props start with `on`; the handler a component defines starts with `handle`.',
    },
    schema: [],
  },
  create(context) {
    return {
      Program(program) {
        const members = moduleComponents(program, context.filename).flatMap(({ propsType }) =>
          typeMembers(program, propsType),
        );
        for (const member of members.filter(isMisnamedCallback)) {
          const name = member.key.name;
          const suffix = name.charAt(0).toUpperCase() + name.slice(1);
          context.report({ node: member, messageId: 'prefix', data: { name, suffix } });
        }
      },
    };
  },
};

const pagesInRoutes = {
  meta: {
    type: 'problem',
    messages: {
      location:
        'Move `{{name}}` to `src/routes/<route-name>/{{name}}.tsx` in its package. Page ' +
        'components live in `src/routes/`, which composes features and the ui kit.',
    },
    schema: [],
  },
  create(context) {
    return {
      Program(program) {
        if (PACKAGE_ROUTES.test(repositoryPath(context))) {
          return;
        }
        for (const component of moduleComponents(program, context.filename)) {
          if (component.name.endsWith('Page')) {
            context.report({ node: component.node, messageId: 'location', data: component });
          }
        }
      },
    };
  },
};

function exportedHooks(program) {
  return program.body
    .filter((statement) => statement.type === 'ExportNamedDeclaration')
    .flatMap((statement) => bindings(statement.declaration))
    .filter(({ id, fn, init }) => HOOK_NAME.test(id.name) && (fn || isFunctionNode(init)))
    .map(({ id }) => id);
}

const fileMatchesExport = {
  meta: {
    type: 'problem',
    messages: {
      mismatch:
        'Rename this file to `{{expected}}`, or move `{{name}}` into `{{expected}}`. A component ' +
        'or hook lives in the file of the same name.',
    },
    schema: [],
  },
  create(context) {
    return {
      Program(program) {
        const path = repositoryPath(context);
        if (isTestFile(path)) {
          return;
        }
        const extension = extname(path);
        const [component] = moduleComponents(program, context.filename);
        const named = [component?.node, ...exportedHooks(program)].filter(Boolean);
        for (const node of named.filter(({ name }) => name !== basename(path, extension))) {
          context.report({
            node,
            messageId: 'mismatch',
            data: { name: node.name, expected: `${node.name}${extension}` },
          });
        }
      },
    };
  },
};

const folderNames = {
  meta: {
    type: 'problem',
    messages: {
      kebab: 'Rename the folder `{{folder}}` to kebab-case, for example `name-input`.',
    },
    schema: [],
  },
  create(context) {
    return {
      Program(program) {
        const folders = dirname(repositoryPath(context)).split('/').slice(1);
        for (const folder of folders) {
          if (!FOLDER_NAME.test(folder)) {
            context.report({ node: program, messageId: 'kebab', data: { folder } });
          }
        }
      },
    };
  },
};

/** The slice a path under a package's `src/` sits in: `{ kind, slice, rest }`, or null. */
function sliceOf(pathInSource) {
  const [kind, slice, ...rest] = pathInSource.split('/');
  return SLICE_KINDS.has(kind) && slice ? { kind, slice, rest } : null;
}

/** The literal module specifiers a file imports or re-exports. */
function moduleSources(report) {
  const check = (node) => {
    if (node.source?.type === 'Literal' && typeof node.source.value === 'string') {
      report(node, node.source.value);
    }
  };
  return {
    ImportDeclaration: check,
    ExportNamedDeclaration: check,
    ExportAllDeclaration: check,
    ImportExpression: check,
  };
}

const sliceIsolation = {
  meta: {
    type: 'problem',
    messages: {
      sibling:
        'Remove this import of the sibling slice `{{target}}`. Folders under `src/{{kind}}/` ' +
        'never import each other: compose them in a route, or move the shared code into ' +
        '`packages/ui` or the one slice that owns it.',
      loose:
        'Move `{{file}}` into a folder of its own under `src/{{kind}}/`, for example ' +
        '`src/{{kind}}/<name>/{{file}}`. Every file under `src/{{kind}}/` belongs to one slice.',
      leavesPackage:
        'Import `{{source}}` by its package name instead of a relative path out of ' +
        '`{{packageRoot}}`. A package reaches another only through its name and public exports.',
    },
    schema: [],
  },
  create(context) {
    const path = repositoryPath(context);
    const source = PACKAGE_SOURCE.exec(path);
    if (!source) {
      return {};
    }
    const [, packageRoot, pathInSource] = source;
    const own = sliceOf(pathInSource);
    return {
      Program(program) {
        if (own && own.rest.length === 0) {
          context.report({
            node: program,
            messageId: 'loose',
            data: { file: own.slice, kind: own.kind },
          });
        }
      },
      ...moduleSources((node, specifier) => {
        if (!specifier.startsWith('.')) {
          return;
        }
        const target = posix.join(posix.dirname(path), specifier);
        if (!target.startsWith(packageRoot)) {
          context.report({
            node,
            messageId: 'leavesPackage',
            data: { source: specifier, packageRoot: packageRoot.replace(/\/$/, '') || '.' },
          });
          return;
        }
        const targetSlice = target.startsWith(`${packageRoot}src/`)
          ? sliceOf(target.slice(`${packageRoot}src/`.length))
          : null;
        if (own?.rest.length && targetSlice?.kind === own.kind && targetSlice.slice !== own.slice) {
          context.report({
            node,
            messageId: 'sibling',
            data: { target: `${targetSlice.kind}/${targetSlice.slice}`, kind: own.kind },
          });
        }
      }),
    };
  },
};

/** Local names bound to `name` imported from `source`, including `import * as` namespaces. */
function importTracker(source, name) {
  const locals = new Set();
  const namespaces = new Set();
  return {
    ImportDeclaration(node) {
      if (node.source.value !== source) {
        return;
      }
      for (const specifier of node.specifiers) {
        if (specifier.type !== 'ImportSpecifier') {
          namespaces.add(specifier.local.name);
        } else if (importedName(specifier) === name) {
          locals.add(specifier.local.name);
        }
      }
    },
    /** Whether `node` names the import: `name`, an alias of it, or `namespace.name`. */
    names(node) {
      if (node?.type === 'Identifier') {
        return locals.has(node.name);
      }
      return (
        node?.type === 'MemberExpression' &&
        node.object.type === 'Identifier' &&
        namespaces.has(node.object.name) &&
        node.property.type === 'Identifier' &&
        node.property.name === name
      );
    },
  };
}

const API_SOURCE = /(^|\/)api\/src\//;

const procedureInputSchema = {
  meta: {
    type: 'problem',
    messages: {
      schema:
        'Pass the procedure input as `Schema.standardSchemaV1(<schema>)` with `Schema` from ' +
        '`effect`, so the procedure validates its input with Effect Schema (ADR 0011).',
    },
    schema: [],
  },
  create(context) {
    if (!API_SOURCE.test(repositoryPath(context)) || isTestFile(context.filename)) {
      return {};
    }
    const schema = importTracker('effect', 'Schema');
    const isStandardSchema = (argument) =>
      argument?.type === 'CallExpression' &&
      argument.callee.type === 'MemberExpression' &&
      argument.callee.property.type === 'Identifier' &&
      argument.callee.property.name === 'standardSchemaV1' &&
      schema.names(argument.callee.object);
    return {
      ImportDeclaration: schema.ImportDeclaration,
      CallExpression(node) {
        const { callee } = node;
        if (
          callee.type === 'MemberExpression' &&
          !callee.computed &&
          callee.property.name === 'input' &&
          !isStandardSchema(node.arguments[0])
        ) {
          context.report({ node, messageId: 'schema' });
        }
      },
    };
  },
};

const formUsesEffectSchema = {
  meta: {
    type: 'problem',
    messages: {
      resolver:
        'Pass `useForm({ resolver: effectTsResolver(<schema>) })` with `effectTsResolver` from ' +
        '`@hookform/resolvers/effect-ts` and the schema in Effect Schema (ADR 0011).',
    },
    schema: [],
  },
  create(context) {
    const useForm = importTracker('react-hook-form', 'useForm');
    const resolver = importTracker('@hookform/resolvers/effect-ts', 'effectTsResolver');
    const isEffectResolver = (property) =>
      property.type === 'Property' &&
      !property.computed &&
      (property.key.name ?? property.key.value) === 'resolver' &&
      property.value.type === 'CallExpression' &&
      resolver.names(property.value.callee);
    return {
      ImportDeclaration(node) {
        useForm.ImportDeclaration(node);
        resolver.ImportDeclaration(node);
      },
      CallExpression(node) {
        if (!useForm.names(node.callee)) {
          return;
        }
        const [options] = node.arguments;
        if (!(options?.type === 'ObjectExpression' && options.properties.some(isEffectResolver))) {
          context.report({ node, messageId: 'resolver' });
        }
      },
    };
  },
};

export default {
  meta: { name: 'policy' },
  rules: {
    'one-component-per-file': oneComponentPerFile,
    'state-and-effects-in-hooks': stateAndEffectsInHooks,
    'handler-names': handlerNames,
    'callback-prop-names': callbackPropNames,
    'pages-in-routes': pagesInRoutes,
    'file-matches-export': fileMatchesExport,
    'folder-names': folderNames,
    'slice-isolation': sliceIsolation,
    'procedure-input-schema': procedureInputSchema,
    'form-uses-effect-schema': formUsesEffectSchema,
  },
};
