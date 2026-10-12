// The password rules, one line each, for showing a live checklist while
// someone types. Each rule here is one lookahead from PASSWORD_REGEX in
// @smartbiotrack/constants — the same rule the API enforces.
//
// They are written out separately instead of imported because a single
// regex can only say yes or no; a checklist needs to say WHICH part is
// missing. That makes this a second copy of the rule, so
// password-rules.test.ts holds the two together: a password passes every
// check here if and only if PASSWORD_REGEX accepts it. Change one without
// the other and that test fails, instead of the checklist quietly ticking
// "done" for a password the server then rejects.

export interface PasswordRule {
  id: string;
  label: string; 
  test: (password: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  { id: "length", label: "At least 8 characters", test: (p) => p.length >= 8 },
  { id: "lowercase", label: "One lowercase letter (a-z)", test: (p) => /[a-z]/.test(p) },
  { id: "uppercase", label: "One uppercase letter (A-Z)", test: (p) => /[A-Z]/.test(p) },
  { id: "number", label: "One number (0-9)", test: (p) => /\d/.test(p) },  
  { id: "special", label: "One special character (e.g. !?#$%)", test: (p) => /[\W_]/.test(p) },
];

export function checkPassword(password: string): { rule: PasswordRule; met: boolean }[] {
  return PASSWORD_RULES.map((rule) => ({ rule, met: rule.test(password) }));
}
 