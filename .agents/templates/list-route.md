# Single-entity list route

| Brief | Folder under `web/src/` | Exact production files |
| --- | --- | --- |
| Todo | `routes/todos/` | `index.ts`, `TodosPage.tsx`, `TodoForm.tsx`, `TodoList.tsx`, `TodoItem.tsx`, `useTodos.ts`, `useTodoForm.ts`, `todoFormSchema.ts` |
| Notes | `routes/notes/` | `index.ts`, `NotesPage.tsx`, `NoteForm.tsx`, `NoteList.tsx`, `NoteItem.tsx`, `useNotes.ts`, `useNoteForm.ts`, `noteFormSchema.ts` |

Export one named component from each component file, with exactly these props in a local interface or inline object type (readonly properties are allowed). The route's `index.ts` exports only its page.

| Component | Exact props and callback signatures |
| --- | --- |
| `TodosPage`, `NotesPage` | no props |
| `TodoForm` | `onCreate: (input: CreateTodo) => void; pending: boolean` |
| `NoteForm` | `onCreate: (input: CreateNote) => void; pending: boolean` |
| `TodoList` | `todos: readonly Todo[]; onToggle: (id: Todo['id']) => void; onDelete: (id: Todo['id']) => void` |
| `TodoItem` | `todo: Todo; onToggle: (id: Todo['id']) => void; onDelete: (id: Todo['id']) => void` |
| `NoteList` | `notes: readonly Note[]; onDelete: (id: Note['id']) => void` |
| `NoteItem` | `note: Note; onDelete: (id: Note['id']) => void` |

Export `Todo`/`Note` and `CreateTodo`/`CreateNote` type aliases from `useTodos.ts`/`useNotes.ts`, derived from the list `RouterOutputs` and create `RouterInputs` respectively. Keep tests beside their subjects in `*.test.ts(x)` files and keep route-local test helpers inside those files; test names/counts remain free within the existing test-beside-subject rule. Other files count toward the exact production inventory; use the fixed api-client test providers. Router keys follow the brief's existing naming freedom. Create inputs contain only title for Todo, and title/body for Notes; preserve the brief's id-type freedom.

`useTodos`/`useNotes` owns server state, mutation pending/error and query refresh through `useTrpc` from the api-client barrel. The page composes Form and List and renders loading/error status; Form receives create pending and renders validation errors from `useTodoForm`/`useNoteForm`. Each form hook uses React Hook Form and its Effect form schema. Local UI state also lives in hooks. List renders Item; callbacks take the id, with no toggle in Notes. Keep every route dependency inside its folder except `@repo/ui`, external npm packages and the fixed api-client public surface (`useTrpc`, `RouterInputs`, `RouterOutputs`, and test providers). This surface is a global primitive: it shares transport wiring without sharing feature state. Copy Button/TextField usage and provider-based tests from `routes/greeting/` in the reference.
