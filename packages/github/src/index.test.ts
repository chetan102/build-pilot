import { describe, it, expect } from 'vitest';
import { isIssueEligible } from './index.js';

describe('github package', () => {
  it('checks issue eligibility by label', () => {
    const eligibleIssue = {
      number: 1,
      title: 'Fix bug',
      labels: [{ name: 'buildpilot' }],
      repository: {
        owner: { login: 'user' },
        name: 'repo',
        full_name: 'user/repo',
      },
    };
    expect(isIssueEligible(eligibleIssue)).toBe(true);

    const ineligibleIssue = {
      ...eligibleIssue,
      labels: [{ name: 'enhancement' }],
    };
    expect(isIssueEligible(ineligibleIssue)).toBe(false);
  });
});
