/** `'reference'` for `apps/`, else the showcase folder name, such as `'todo-01'`. */
export type ResultId = string;

export interface Result {
  readonly id: ResultId;
  readonly root: 'apps' | `showcase/${string}`;
  /** The npm scope of the result's packages: `repo` for the reference, else the id. */
  readonly scope: string;
  readonly web: string;
  readonly api: string;
  readonly ports: { readonly web: number; readonly api: number };
}

export function listResults(repositoryRoot: string): readonly Result[];
