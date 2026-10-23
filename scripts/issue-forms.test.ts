import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface IssueField {
  id: string;
  type: string;
  attributes: { label: string; value?: string };
  validations?: { required?: boolean };
}

interface IssueForm {
  name: string;
  description: string;
  body: IssueField[];
}

// JSON is a YAML subset, so these forms need no extra parser dependency (ADR 0056).
const form: IssueForm = JSON.parse(
  readFileSync(resolve(__dirname, '../.github/ISSUE_TEMPLATE/prd-change.yml'), 'utf8'),
);
const config: unknown = JSON.parse(
  readFileSync(resolve(__dirname, '../.github/ISSUE_TEMPLATE/config.yml'), 'utf8'),
);

describe('PRD change issue form', () => {
  it('has chooser metadata and unique field identifiers', () => {
    expect(form.name).toBe('PRD change');
    expect(form.description).toEqual(expect.stringMatching(/\S/));
    expect(new Set(form.body.map((field) => field.id)).size).toBe(form.body.length);
  });

  it.each([
    ['conflicting-prd', 'Which PRD does this conflict with or supersede?'],
    ['proposed-prd-diff', 'Proposed PRD diff'],
    ['outcome', 'Outcome'],
  ])('requires an answer for %s', (id, label) => {
    const fields = form.body.filter((field) => field.id === id);
    expect(fields).toHaveLength(1);
    expect(fields[0]).toEqual(
      expect.objectContaining({
        type: expect.stringMatching(/^(input|textarea)$/),
        attributes: expect.objectContaining({ label }),
        validations: expect.objectContaining({ required: true }),
      }),
    );
    expect(fields[0]).not.toHaveProperty('attributes.value');
  });

  it('offers an optional E2E test field', () => {
    expect(form.body.filter((field) => field.id === 'e2e-tests')).toEqual([
      expect.objectContaining({
        type: 'textarea',
        attributes: expect.objectContaining({ label: 'E2E tests that would change' }),
        validations: { required: false },
      }),
    ]);
  });

  it('keeps blank issues enabled', () => {
    expect(config).toEqual(expect.objectContaining({ blank_issues_enabled: true }));
  });
});
