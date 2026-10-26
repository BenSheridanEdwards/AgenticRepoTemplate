/** The fixed contract of each in-repository trial brief. */
export const BRIEFS = {
  todo: {
    route: { folder: 'todos', entity: 'Todo' },
    operations: ['list', 'create', 'toggle', 'delete'],
    item: { id: null, title: 'string', completed: 'boolean' },
    createInput: '{ title: string }',
  },
  notes: {
    route: { folder: 'notes', entity: 'Note' },
    operations: ['list', 'create', 'delete'],
    item: { id: null, title: 'string', body: 'string' },
    createInput: '{ body: string; title: string }',
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
