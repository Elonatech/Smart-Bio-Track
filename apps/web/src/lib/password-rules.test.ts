import { PASSWORD_REGEX } from '@smartbiotrack/constants';
import { checkPassword, PASSWORD_RULES } from './password-rules';

const allMet = (password: string) => checkPassword(password).every((check) => check.met);

describe('password rules', () => {
  // The whole point of this file: the checklist must never disagree with the
  // rule the server actually enforces.
  it.each([
    '',
    'a',
    'abcdefgh',
    'ABCDEFGH',
    '12345678',
    'abcdefg1',
    'Abcdefg1',
    'Abcdef1!',
    'Abcde1!',
    'abcdef1!',
    'ABCDEF1!',
    'Abcdefg!',
    'Abcdef 1',
    'Abc_def1',
    'Ábcdef1!',
    'Passw0rd',
    'P@ssw0rd',
    'correct horse battery staple',
    'Correct Horse 9',
    '𝓟𝓪𝓼𝓼𝔀𝓸𝓻𝓭1!',
  ])('agrees with the server rule for %j', (password) => {
    expect(allMet(password)).toBe(PASSWORD_REGEX.test(password));
  });

  it('has exactly the five rules a user is told about', () => {
    expect(PASSWORD_RULES.map((rule) => rule.id)).toEqual([
      'length',
      'lowercase',
      'uppercase',
      'number',
      'special',
    ]);
  });

  it('says 8 characters, matching the server minimum', () => {
    expect(PASSWORD_RULES[0].label).toBe('At least 8 characters');
    expect(checkPassword('Abcde1!')[0].met).toBe(false);
    expect(checkPassword('Abcdef1!')[0].met).toBe(true);
  });

  it('reports which rule is missing, not just that something is', () => {
    const missing = checkPassword('abcdefgh')
      .filter((check) => !check.met)
      .map((check) => check.rule.id);

    expect(missing).toEqual(['uppercase', 'number', 'special']);
  });
});
