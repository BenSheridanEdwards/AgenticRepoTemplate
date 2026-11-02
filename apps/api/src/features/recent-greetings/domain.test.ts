import { addRecentName, RECENT_GREETINGS_LIMIT } from './domain.ts';

it('puts the newest name first and retains repeated names', () => {
  expect(addRecentName(['Ada', 'Lin'], 'Ada')).toEqual(['Ada', 'Ada', 'Lin']);
});

it('keeps only the ten newest names', () => {
  expect(RECENT_GREETINGS_LIMIT).toBe(10);
  const names = Array.from({ length: 10 }, (_, index) => `Name ${index}`);
  expect(addRecentName(names, 'Lin')).toEqual(['Lin', ...names.slice(0, 9)]);
});

it('leaves the input array unchanged', () => {
  const names = Object.freeze(['Ada']);
  expect(addRecentName(names, 'Lin')).toEqual(['Lin', 'Ada']);
  expect(names).toEqual(['Ada']);
});
