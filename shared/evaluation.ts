export interface EvaluationResult {
  id: string;
  name: string;
  category: 'AI output validation' | 'Evidence completeness' | 'Release criteria';
  expected: string;
  actual: string;
  passed: boolean;
  detail: string;
}
export interface EvaluationReport {
  suite: string;
  executedAt: string;
  passed: number;
  total: number;
  results: EvaluationResult[];
}
