/** The fixed contract of each in-repository trial brief. */
export const BRIEFS = {
  todo: {
    operations: ['list', 'create', 'toggle', 'delete'],
    item: { id: null, title: 'string', completed: 'boolean' },
    createInput: '{ title: string }',
  },
  notes: {
    operations: ['list', 'create', 'delete'],
    item: { id: null, title: 'string', body: 'string' },
    createInput: '{ body: string; title: string }',
  },
};
