// One policy text for request generation and a separate, initially pending review.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

export const editorialRulesVersion = '1.0.0';
export const editorialRules = readFileSync(new URL('../docs/GEMINI_EDITORIAL_RULES.md', import.meta.url), 'utf8');
export const editorialRulesSha256 = createHash('sha256').update(editorialRules).digest('hex');

export function pendingEditorialReview() {
  return {
    rulesVersion: editorialRulesVersion,
    rulesSha256: editorialRulesSha256,
    status: 'pending_review',
    reviewer: null,
    decision: null,
    criteria: ['task', 'reference', 'setup', 'demo', 'claims', 'costs_limits', 'body_hooks', 'approval']
      .map(id => ({id, status: 'pending', evidence: [], note: null})),
    semanticFactCheckAutomated: false,
    topicSelectionLiveVerified: false,
    romanScriptApprovalGranted: false,
  };
}
