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
      reexport:
        'Call `{{hook}}` inside a named custom hook instead of re-exporting it. A re-export ' +
        'hides the hook from this rule.',
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
          const hook = specifier.local.name ?? specifier.local.value;
          if (hooks.has(hook)) {
            context.report({ node: specifier, messageId: 'reexport', data: { hook } });
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

const roleNamedFolders = {
  meta: {
    type: 'problem',
    messages: {
      catchAll:
        'Move the code out of `{{path}}/`: put it in the slice that uses it, or in `@repo/ui` ' +
        'if it is a shared UI primitive. Name each folder for its role (for example ' +
        '`name-input` or `api-client`), never a catch-all such as `{{folder}}`.',
    },
    schema: [],
  },
  create(context) {
    const source = PACKAGE_SOURCE.exec(repositoryPath(context));
    if (!source) {
      return {};
    }
    const folders = posix.dirname(source[2]).split('/');
    return {
      Program(program) {
        folders.forEach((folder, index) => {
          if (CATCH_ALL_FOLDERS.has(folder)) {
            const path = ['src', ...folders.slice(0, index + 1)].join('/');
            context.report({ node: program, messageId: 'catchAll', data: { path, folder } });
          }
        });
      },
    };
  },
};

const testBesideSubject = {
  meta: {
    type: 'problem',
    messages: {
      testsFolder:
        'Move `{{test}}` out of `__tests__/` to sit beside its subject `{{subject}}.ts` or ' +
        '`{{subject}}.tsx`. Each test sits beside its subject as `<Name>.test.ts(x)`.',
      missingSubject:
        'Move this test beside its subject, or rename it to match: no `{{subject}}.ts` or ' +
        '`{{subject}}.tsx` exists. Each test sits beside its subject as `<Name>.test.ts(x)`.',
    },
    schema: [],
  },
  create(context) {
    const path = repositoryPath(context);
    if (!isTestFile(path)) {
      return {};
    }
    // `Foo.a11y.test.tsx` tests `Foo`, and `todo.schema.test.ts` tests `todo.schema`.
    const parts = basename(path)
      .replace(/\.test\.tsx?$/, '')
      .split('.');
    const folders = posix.dirname(path).split('/');
    const subjectFolders = folders.filter((folder) => folder !== '__tests__');
    const subject = [...subjectFolders, parts[0]].join('/');
    const subjectFiles = parts.flatMap((_, index) =>
      ['.ts', '.tsx'].map(
        (extension) =>
          `${[...subjectFolders, parts.slice(0, index + 1).join('.')].join('/')}${extension}`,
      ),
    );
    return {
      Program(program) {
        if (subjectFolders.length < folders.length) {
          context.report({
            node: program,
            messageId: 'testsFolder',
            data: { test: path, subject },
          });
        } else if (!subjectFiles.some((file) => existsSync(join(context.cwd, file)))) {
          context.report({ node: program, messageId: 'missingSubject', data: { subject } });
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

/** A string literal, or a template literal with no expressions, as its text. */
function staticText(node) {
  if (node?.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }
  return node?.type === 'TemplateLiteral' && node.expressions.length === 0
    ? node.quasis[0].value.cooked
    : undefined;
}

/**
 * The static module specifiers a file imports, re-exports or requires: `import`,
 * `export ... from`, `import()`, `require()` and `import x = require()`.
 */
function moduleSources(report) {
  const check = (node, source) => {
    const specifier = staticText(source);
    if (specifier !== undefined) {
      report(node, specifier);
    }
  };
  const checkSource = (node) => check(node, node.source);
  return {
    ImportDeclaration: checkSource,
    ExportNamedDeclaration: checkSource,
    ExportAllDeclaration: checkSource,
    ImportExpression: checkSource,
    TSExternalModuleReference: (node) => check(node, node.expression),
    CallExpression(node) {
      if (node.callee.type === 'Identifier' && node.callee.name === 'require') {
        check(node, node.arguments[0]);
      }
    },
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

/**
 * Tracks `Schema.toStandardSchemaV1(<schema>)` with `Schema` from `effect`, or
 * `toStandardSchemaV1` from `effect/Schema`: an Effect Schema handed to a
 * Standard Schema consumer (ADR 0036).
 */
function effectStandardSchema() {
  const schema = importTracker('effect', 'Schema');
  const schemaModule = importTracker('effect/Schema', 'toStandardSchemaV1');
  return {
    ImportDeclaration(node) {
      schema.ImportDeclaration(node);
      schemaModule.ImportDeclaration(node);
    },
    /** Whether `node` is that call. */
    wraps(node) {
      return (
        node?.type === 'CallExpression' &&
        (schemaModule.names(node.callee) ||
          (node.callee.type === 'MemberExpression' &&
            node.callee.property.type === 'Identifier' &&
            node.callee.property.name === 'toStandardSchemaV1' &&
            schema.names(node.callee.object)))
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
        'Pass the procedure input as `Schema.toStandardSchemaV1(<schema>)` with `Schema` from ' +
        '`effect`, so the procedure validates its input with Effect Schema (ADR 0011).',
    },
    schema: [],
  },
  create(context) {
    if (!API_SOURCE.test(repositoryPath(context)) || isTestFile(context.filename)) {
      return {};
    }
    const standardSchema = effectStandardSchema();
    return {
      ImportDeclaration: standardSchema.ImportDeclaration,
      CallExpression(node) {
        const { callee } = node;
        if (
          callee.type === 'MemberExpression' &&
          (callee.computed ? callee.property.value : callee.property.name) === 'input' &&
          !standardSchema.wraps(node.arguments[0])
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
        'Pass `useForm({ resolver: standardSchemaResolver(Schema.toStandardSchemaV1(<schema>)) })` ' +
        'with `standardSchemaResolver` from `@hookform/resolvers/standard-schema` and `Schema` ' +
        'from `effect`, so the form validates with Effect Schema (ADR 0011). Pass the schema ' +
        'as the only argument, so the form submits the decoded value, and write the options ' +
        'inline, with no spread that could replace the resolver.',
    },
    schema: [],
  },
  create(context) {
    const useForm = importTracker('react-hook-form', 'useForm');
    const resolver = importTracker('@hookform/resolvers/standard-schema', 'standardSchemaResolver');
    const standardSchema = effectStandardSchema();
    const isEffectResolver = (property) =>
      property.type === 'Property' &&
      !property.computed &&
      (property.key.name ?? property.key.value) === 'resolver' &&
      property.value.type === 'CallExpression' &&
      resolver.names(property.value.callee) &&
      property.value.arguments.length === 1 &&
      standardSchema.wraps(property.value.arguments[0]);
    return {
      ImportDeclaration(node) {
        useForm.ImportDeclaration(node);
        resolver.ImportDeclaration(node);
        standardSchema.ImportDeclaration(node);
      },
      CallExpression(node) {
        if (!useForm.names(node.callee)) {
          return;
        }
        const [options] = node.arguments;
        const valid =
          options?.type === 'ObjectExpression' &&
          options.properties.some(isEffectResolver) &&
          !options.properties.some((property) => property.type === 'SpreadElement');
        if (!valid) {
          context.report({ node, messageId: 'resolver' });
        }
      },
    };
  },
};

// Sarah Fim's "anti-slop" factory bans a comment longer than a few lines:
// prefer self-explanatory code (NORTH_STAR §1). The scaffold ships one necessary
// four-line comment (`web/src/api-client/trpc.ts`), copied verbatim into every
// frozen trial result (ADR 0034, ADR 0035), so the enforced ceiling is four
// lines; a fifth line fails. ADR 0050 records the threshold.
const MAX_COMMENT_LINES = 4;

const noLargeComments = {
  meta: {
    type: 'suggestion',
    messages: {
      tooLong:
        'This comment spans {{lines}} lines. Keep a comment to {{max}} lines or fewer: delete it ' +
        'for self-explanatory code, or move a long rationale into a doc or an ADR.',
    },
    schema: [],
  },
  create(context) {
    const source = context.sourceCode;
    const span = (first, last) => last.loc.end.line - first.loc.start.line + 1;
    const report = (first, last) =>
      context.report({
        loc: { start: first.loc.start, end: last.loc.end },
        messageId: 'tooLong',
        data: { lines: span(first, last), max: MAX_COMMENT_LINES },
      });
    return {
      Program() {
        let run = [];
        const flushRun = () => {
          if (run.length > 0 && span(run[0], run[run.length - 1]) > MAX_COMMENT_LINES) {
            report(run[0], run[run.length - 1]);
          }
          run = [];
        };
        for (const comment of source.getAllComments()) {
          const previous = run.at(-1);
          if (
            previous &&
            (comment.loc.start.line > previous.loc.end.line + 1 ||
              source.text.slice(previous.range[1], comment.range[0]).trim())
          ) {
            flushRun();
          }
          run.push(comment);
        }
        flushRun();
      },
    };
  },
};

const useUiPrimitives = {
  meta: {
    type: 'problem',
    schema: [],
    messages: { primitive: 'Use {{primitive}} from @repo/ui for this control.' },
  },
  create(context) {
    if (repositoryPath(context).startsWith('packages/ui/') || isTestFile(context.filename)) {
      return {};
    }
    const element = importTracker('react', 'createElement');
    const check = (node, tag, type) => {
      if (tag === 'button' || (tag === 'input' && !['checkbox', 'radio'].includes(type))) {
        context.report({
          node,
          messageId: 'primitive',
          data: { primitive: tag === 'button' ? 'Button' : 'TextField' },
        });
      }
    };
    return {
      ImportDeclaration: element.ImportDeclaration,
      JSXOpeningElement(node) {
        const type = node.attributes.findLast(
          (attribute) => attribute.type === 'JSXSpreadAttribute' || attribute.name.name === 'type',
        )?.value;
        check(node, node.name.name, type?.value ?? type?.expression?.value);
      },
      CallExpression(node) {
        if (element.names(node.callee)) {
          const type = node.arguments[1]?.properties?.findLast(
            (property) =>
              property.type === 'SpreadElement' ||
              property.computed ||
              property.key?.name === 'type' ||
              property.key?.value === 'type',
          );
          check(node, node.arguments[0]?.value, type?.computed ? undefined : type?.value?.value);
        }
      },
    };
  },
};

export default {
  meta: { name: 'policy' },
  rules: {
    'one-component-per-file': oneComponentPerFile,
    'no-large-comments': noLargeComments,
    'use-ui-primitives': useUiPrimitives,
    'state-and-effects-in-hooks': stateAndEffectsInHooks,
    'handler-names': handlerNames,
    'callback-prop-names': callbackPropNames,
    'pages-in-routes': pagesInRoutes,
    'file-matches-export': fileMatchesExport,
    'folder-names': folderNames,
    'role-named-folders': roleNamedFolders,
    'test-beside-subject': testBesideSubject,
    'slice-isolation': sliceIsolation,
    'procedure-input-schema': procedureInputSchema,
    'form-uses-effect-schema': formUsesEffectSchema,
  },
};
