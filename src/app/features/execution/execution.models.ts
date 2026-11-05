import { CaseDefinition } from '../test-cases/test-case.models';
import { ListQuery } from '../workspaces/workspace.models';

export const planLabels = {
  DRAFT: 'Rascunho',
  ACTIVE: 'Ativo',
  COMPLETED: 'Concluído',
  ARCHIVED: 'Arquivado',
};
export const runLabels = {
  CREATED: 'Criada',
  IN_PROGRESS: 'Em andamento',
  COMPLETED: 'Concluída',
  ABORTED: 'Abortada',
};
export const resultLabels = {
  NOT_TESTED: 'Não testado',
  PASSED: 'Passou',
  FAILED: 'Falhou',
  BLOCKED: 'Bloqueado',
  SKIPPED: 'Ignorado',
};
export type TestResult = keyof typeof resultLabels;
export interface PlanCase {
  id: string;
  workspaceId: string;
  projectId: string;
  testPlanId: string;
  testCaseId: string;
  position: number;
}
export interface TestPlan {
  id: string;
  workspaceId: string;
  projectId: string;
  milestoneId: string | null;
  environmentId: string | null;
  name: string;
  description: string | null;
  status: keyof typeof planLabels;
  version: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  activatedAt: string | null;
  completedAt: string | null;
  archivedAt: string | null;
  cases: PlanCase[];
}
export interface ContextSnapshot {
  name: string;
  description: string | null;
}
export interface TestRun {
  id: string;
  workspaceId: string;
  projectId: string;
  testPlanId: string | null;
  milestoneId: string | null;
  environmentId: string | null;
  planNameSnapshot: string | null;
  milestoneSnapshot: ContextSnapshot | null;
  environmentSnapshot: ContextSnapshot | null;
  name: string;
  source: 'MANUAL';
  externalRunRef: null;
  status: keyof typeof runLabels;
  version: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  summary: {
    total: number;
    notTested: number;
    passed: number;
    failed: number;
    blocked: number;
    skipped: number;
  };
}
export interface FieldSnapshot {
  fieldId: string;
  key: string;
  name: string;
  type: string;
  required: boolean;
  options: { id: string; label: string }[];
  archivedAt: string | null;
  value: string | number | boolean;
}
export interface RunStep {
  id: string;
  workspaceId: string;
  projectId: string;
  testRunId: string;
  testRunCaseId: string;
  sourceStepId: string;
  position: number;
  actionSnapshot: string;
  testDataSnapshot: string | null;
  expectedResultSnapshot: string | null;
  actualResult: string | null;
  result: TestResult;
  comment: string | null;
  executedBy: string | null;
  executedAt: string | null;
}
export interface RunCase {
  id: string;
  workspaceId: string;
  projectId: string;
  testRunId: string;
  testCaseId: string;
  position: number;
  caseSequenceSnapshot: number;
  humanIdSnapshot: string;
  titleSnapshot: string;
  severitySnapshot: CaseDefinition['severity'];
  prioritySnapshot: CaseDefinition['priority'];
  definitionSnapshot: Omit<CaseDefinition, 'title' | 'severity' | 'priority' | 'status'> & {
    status: string;
    version: number;
    suiteId: string | null;
  };
  customFieldsSnapshot: FieldSnapshot[];
  tagsSnapshot: { id: string; name: string }[];
  result: TestResult;
  executedBy: string | null;
  executedAt: string | null;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
  steps: RunStep[];
}
export interface ExecutionComment {
  id: string;
  workspaceId: string;
  projectId: string;
  testRunId: string;
  runCaseId: string | null;
  runStepId: string | null;
  text: string;
  createdBy: string;
  createdAt: string;
}
export interface PlanBody {
  name: string;
  description?: string | null;
  milestoneId?: string | null;
  environmentId?: string | null;
  caseIds?: string[];
}
export interface RunBody {
  name: string;
  caseIds: string[];
  milestoneId?: string | null;
  environmentId?: string | null;
}
export interface ResultBody {
  version: number;
  result: TestResult;
  comment?: string | null;
}
export interface CommentBody {
  version: number;
  text: string;
  runCaseId?: string | null;
  runStepId?: string | null;
}
export interface RunQuery extends ListQuery {
  testPlanId?: string;
}
export interface RunCaseQuery extends Omit<ListQuery, 'status'> {
  result?: TestResult | 'ALL';
}
export function canPass(item: RunCase): boolean {
  return item.steps.every((step) => step.result === 'PASSED' || step.result === 'SKIPPED');
}
export function fieldSnapshotValue(field: FieldSnapshot): string {
  if (field.type === 'SINGLE_SELECT')
    return field.options.find((option) => option.id === field.value)?.label ?? String(field.value);
  if (typeof field.value === 'boolean') return field.value ? 'Sim' : 'Não';
  return String(field.value);
}
