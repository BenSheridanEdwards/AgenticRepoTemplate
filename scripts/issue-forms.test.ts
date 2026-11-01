import { readdirSync, readFileSync } from 'node:fs';
import { matchesGlob, resolve } from 'node:path';

interface IssueField {
  id: string;
  type: string;
  attributes: { label: string; placeholder?: string; value?: string };
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

  it('turns blank issues off', () => {
    expect(config).toEqual(expect.objectContaining({ blank_issues_enabled: false }));
  });
});

const formsDirectory = resolve(__dirname, '../.github/ISSUE_TEMPLATE');
const requiredFieldsByForm = new Map<string, string[]>([
  ['prd-change.yml', ['proposed-prd-diff', 'conflicting-prd', 'outcome']],
  ['intent.yml', ['intent', 'prd', 'outcome']],
]);

describe('issue intake', () => {
  it('the intent form requires an intent, a PRD and an outcome', () => {
    const intentForm: IssueForm = JSON.parse(
      readFileSync(resolve(formsDirectory, 'intent.yml'), 'utf8'),
    );
    expect(intentForm.name).toBe('Intent');
    expect(intentForm.description).toEqual(expect.stringMatching(/\S/));
    expect(intentForm.body.map((field) => field.id).sort()).toEqual(['intent', 'outcome', 'prd']);
    expect(new Set(intentForm.body.map((field) => field.id)).size).toBe(intentForm.body.length);
    intentForm.body.forEach((field) => {
      expect(field.validations?.required).toBe(true);
      expect(field.attributes.placeholder).toEqual(expect.stringMatching(/\S/));
      expect(field.attributes).not.toHaveProperty('value');
    });
  });

  it.each(
    readdirSync(formsDirectory).filter(
      (file) => matchesGlob(file, '*.yml') && file !== 'config.yml',
    ),
  )('every issue form requires an intent, a PRD link and a North Star outcome: %s', (file) => {
    const requiredFields = requiredFieldsByForm.get(file);
    if (!requiredFields)
      throw new Error(`Map the required intent, PRD and outcome fields for ${file}`);
    const issueForm: IssueForm = JSON.parse(readFileSync(resolve(formsDirectory, file), 'utf8'));
    expect(new Set(issueForm.body.map((field) => field.id)).size).toBe(issueForm.body.length);
    requiredFields.forEach((id) => {
      const fields = issueForm.body.filter((field) => field.id === id);
      expect(fields).toHaveLength(1);
      expect(fields[0]).toEqual(
        expect.objectContaining({
          type: expect.stringMatching(/^(input|textarea)$/),
          attributes: expect.objectContaining({ placeholder: expect.stringMatching(/\S/) }),
          validations: expect.objectContaining({ required: true }),
        }),
      );
    });
    issueForm.body.forEach((field) => {
      expect(field.attributes).not.toHaveProperty('value');
    });
  });
});
