// Repository policy rules that no installed plugin expresses (ADR 0018). Each
// message names the fix, so an agent can act on the error alone.
import { basename, dirname, extname, relative, sep } from 'node:path';

const PASCAL_CASE = /^[A-Z][A-Za-z0-9]*$/;
const HOOK_NAME = /^use[A-Z0-9]/;
const KEBAB_CASE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const COMPONENT_WRAPPERS = new Set(['memo', 'forwardRef']);
const STATE_AND_EFFECT_HOOKS = new Set([
  'useState',
  'useReducer',
  'useEffect',
  'useLayoutEffect',
  'useInsertionEffect',
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

/** Module-scope components of a `.tsx` file: `{ name, node, fn }` per PascalCase function. */
function moduleComponents(program, filename) {
  if (extname(filename) !== '.tsx') {
    return [];
  }
  return program.body
    .flatMap((statement) => bindings(unwrapExport(statement)))
    .map(({ id, fn, init }) => ({ name: id.name, node: id, fn: fn ?? wrappedFunction(init) }))
    .filter((component) => component.fn && PASCAL_CASE.test(component.name));
}

const repositoryPath = (context) => relative(context.cwd, context.filename).split(sep).join('/');
const isTestFile = (path) => /\.test\.tsx?$/.test(path);

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

const stateAndEffectsInHooks = {
  meta: {
    type: 'problem',
    messages: {
      outsideHook:
        'Move `{{hook}}` into a named custom hook (for example `useServiceStatus` in ' +
        '`useServiceStatus.ts`) and call that hook here. State and effects live only in `use*` hooks.',
    },
    schema: [],
  },
  create(context) {
    const reactNames = new Map();
    const reactNamespaces = new Set();
    const restrictedHook = (callee) => {
      if (callee.type === 'Identifier') {
        return reactNames.get(callee.name);
      }
      if (
        callee.type === 'MemberExpression' &&
        callee.object.type === 'Identifier' &&
        reactNamespaces.has(callee.object.name) &&
        callee.property.type === 'Identifier' &&
        STATE_AND_EFFECT_HOOKS.has(callee.property.name)
      ) {
        return callee.property.name;
      }
      return undefined;
    };
    return {
      ImportDeclaration(node) {
        if (node.source.value !== 'react') {
          return;
        }
        for (const specifier of node.specifiers) {
          if (specifier.type === 'ImportSpecifier') {
            const imported = specifier.imported.name ?? specifier.imported.value;
            if (STATE_AND_EFFECT_HOOKS.has(imported)) {
              reactNames.set(specifier.local.name, imported);
            }
          } else {
            reactNamespaces.add(specifier.local.name);
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

const isCallbackHook = (init) =>
  init?.type === 'CallExpression' &&
  init.callee.type === 'Identifier' &&
  init.callee.name === 'useCallback';

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
    return declaration.body.body;
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
        const members = moduleComponents(program, context.filename).flatMap(({ fn }) =>
          typeMembers(program, fn.params[0]?.typeAnnotation?.typeAnnotation),
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
        'Move `{{name}}` to `src/routes/<route-name>/{{name}}.tsx`. Page components live in ' +
        '`src/routes/`, which composes features and shared code.',
    },
    schema: [],
  },
  create(context) {
    return {
      Program(program) {
        if (repositoryPath(context).startsWith('src/routes/')) {
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
      kebab: 'Rename the folder `{{folder}}` to kebab-case, for example `threshold-counter`.',
    },
    schema: [],
  },
  create(context) {
    return {
      Program(program) {
        const folders = dirname(repositoryPath(context)).split('/').slice(1);
        for (const folder of folders) {
          if (!KEBAB_CASE.test(folder)) {
            context.report({ node: program, messageId: 'kebab', data: { folder } });
          }
        }
      },
    };
  },
};

const disableReason = {
  meta: {
    type: 'problem',
    messages: {
      reason:
        'Add the reason after `--`, for example `// eslint-disable-next-line <rule> -- <why this ' +
        'line is the exception>`.',
    },
    schema: [],
  },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          const text = comment.value.trim();
          if (/^eslint-disable(-next-line|-line)?(\s|$)/.test(text) && !/\s--\s+\S/.test(text)) {
            context.report({ loc: comment.loc, messageId: 'reason' });
          }
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
    'disable-reason': disableReason,
  },
};
