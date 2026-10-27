/** The fixed contract of each in-repository trial brief. */
export const BRIEFS = {
  todo: {
    route: { folder: 'todos', entity: 'Todo' },
    operations: ['list', 'create', 'toggle', 'delete'],
    item: { id: null, title: 'string', completed: 'boolean' },
    createInput: '{ title: string }',
    api: {
      router: 'todos',
      item: 'Schema.Struct({ id: Schema.String, title: Schema.String, completed: Schema.Boolean })',
      procedures: {
        list: { kind: 'query', input: 'Schema.Undefined', output: 'Schema.Array(Todo)' },
        create: {
          kind: 'mutation',
          input: 'Schema.Struct({ title: Schema.Trim.check(Schema.isNonEmpty()) })',
          output: 'Todo',
        },
        toggle: { kind: 'mutation', input: 'Schema.Struct({ id: Schema.String })', output: 'Todo' },
        delete: {
          kind: 'mutation',
          input: 'Schema.Struct({ id: Schema.String })',
          output: 'Schema.Struct({ id: Schema.String })',
        },
      },
    },
  },
  notes: {
    route: { folder: 'notes', entity: 'Note' },
    operations: ['list', 'create', 'delete'],
    item: { id: null, title: 'string', body: 'string' },
    createInput: '{ body: string; title: string }',
    api: {
      router: 'notes',
      item: 'Schema.Struct({ id: Schema.String, title: Schema.String, body: Schema.String })',
      procedures: {
        list: { kind: 'query', input: 'Schema.Undefined', output: 'Schema.Array(Note)' },
        create: {
          kind: 'mutation',
          input:
            'Schema.Struct({ title: Schema.Trim.check(Schema.isNonEmpty()), body: Schema.String })',
          output: 'Note',
        },
        delete: {
          kind: 'mutation',
          input: 'Schema.Struct({ id: Schema.String })',
          output: 'Schema.Struct({ id: Schema.String })',
        },
      },
    },
  },
};

export function routeInventory(id) {
  const brief = BRIEFS[/^(.*?)(?:-[a-z]+)?-0[1-3]$/.exec(id)?.[1]];
  if (!brief) return null;
  const { folder, entity } = brief.route;
  const plural = folder[0].toUpperCase() + folder.slice(1);
  const singular = entity.toLowerCase();
  const callbacks = `${brief.operations.includes('toggle') ? `onToggle: (id: ${entity}['id']) => void; ` : ''}onDelete: (id: ${entity}['id']) => void`;
  const components = {
    [`${plural}Page`]: '',
    [`${entity}Form`]: `onCreate: (input: Create${entity}) => void; pending: boolean`,
    [`${entity}List`]: `${folder}: readonly ${entity}[]; ${callbacks}`,
    [`${entity}Item`]: `${singular}: ${entity}; ${callbacks}`,
  };
  const files = [
    'index.ts',
    `use${plural}.ts`,
    `use${entity}Form.ts`,
    `${singular}FormSchema.ts`,
    ...Object.keys(components).map((name) => `${name}.tsx`),
  ];
  return { folder, components, files };
}
