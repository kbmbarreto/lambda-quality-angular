import { ListQuery, Page } from '../workspaces/workspace.models';
import { EMPTY, Observable, expand, reduce } from 'rxjs';

export const caseOptions = {
  status: { DRAFT: 'Rascunho', ACTIVE: 'Ativo', DEPRECATED: 'Descontinuado' },
  severity: {
    TRIVIAL: 'Trivial',
    MINOR: 'Menor',
    NORMAL: 'Normal',
    MAJOR: 'Maior',
    CRITICAL: 'Crítica',
    BLOCKER: 'Bloqueante',
  },
  priority: { LOW: 'Baixa', MEDIUM: 'Média', HIGH: 'Alta', URGENT: 'Urgente' },
  type: {
    FUNCTIONAL: 'Funcional',
    REGRESSION: 'Regressão',
    SMOKE: 'Smoke',
    SANITY: 'Sanidade',
    PERFORMANCE: 'Desempenho',
    SECURITY: 'Segurança',
    USABILITY: 'Usabilidade',
    OTHER: 'Outro',
  },
  layer: {
    E2E: 'Ponta a ponta',
    API: 'API',
    INTEGRATION: 'Integração',
    UNIT: 'Unitário',
    COMPONENT: 'Componente',
    OTHER: 'Outra',
  },
  automationStatus: {
    MANUAL: 'Manual',
    TO_BE_AUTOMATED: 'A automatizar',
    IN_PROGRESS: 'Em automação',
    AUTOMATED: 'Automatizado',
    NOT_APPLICABLE: 'Não aplicável',
  },
} as const;
export type CaseStatus = keyof typeof caseOptions.status;
export interface CaseDefinition {
  title: string;
  description: string | null;
  preconditions: string | null;
  postconditions: string | null;
  severity: keyof typeof caseOptions.severity;
  priority: keyof typeof caseOptions.priority;
  status: CaseStatus;
  type: keyof typeof caseOptions.type;
  layer: keyof typeof caseOptions.layer;
  behavior: string | null;
  automationStatus: keyof typeof caseOptions.automationStatus;
}
export interface FieldValue {
  fieldId: string;
  value: string | number | boolean | null;
}
export interface StepBody {
  action: string;
  testData?: string | null;
  expectedResult?: string | null;
}
export interface TestStep extends Required<StepBody> {
  id: string;
  workspaceId: string;
  projectId: string;
  testCaseId: string;
  position: number;
}
export interface TestCase extends Omit<CaseDefinition, 'status'> {
  id: string;
  workspaceId: string;
  projectId: string;
  createdBy: string;
  suiteId: string | null;
  sequence: number;
  version: number;
  humanId: string;
  status: CaseStatus | 'ARCHIVED';
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  steps: TestStep[];
  tagIds: string[];
  attachmentIds: string[];
  customFields: FieldValue[];
}
export interface TestSuite {
  id: string;
  workspaceId: string;
  projectId: string;
  parentSuiteId: string | null;
  name: string;
  description: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}
export interface RepositorySummary {
  totalCases: number;
  suites: { suiteId: string | null; totalCases: number }[];
}
export interface SuiteBody {
  name: string;
  description?: string | null;
}
export type CreateCase = Pick<CaseDefinition, 'title'> &
  Partial<Omit<CaseDefinition, 'title'>> & {
    suiteId?: string | null;
    steps?: StepBody[];
    tagIds?: string[];
    attachmentIds?: string[];
    customFields?: FieldValue[];
  };
export type UpdateCase = Partial<CaseDefinition> & { version: number; customFields?: FieldValue[] };
export interface CaseQuery extends ListQuery {
  suiteId?: string;
  root?: boolean;
  tagId?: string;
  priority?: CaseDefinition['priority'];
  automationStatus?: CaseDefinition['automationStatus'];
}
export interface SuiteQuery extends ListQuery {
  parentSuiteId?: string;
  root?: boolean;
}
export function options(values: Record<string, string>): { value: string; label: string }[] {
  return Object.entries(values).map(([value, label]) => ({ value, label }));
}
// Publish only after every page succeeds, so an incomplete tree cannot be reordered.
export function allPages<T>(load: (page: number) => Observable<Page<T>>): Observable<T[]> {
  return load(1).pipe(
    expand(
      (result) => (result.meta.pagination.hasNext ? load(result.meta.pagination.page + 1) : EMPTY),
      1,
    ),
    reduce((rows, result) => [...rows, ...result.data], [] as T[]),
  );
}
export function suiteLabel(suite: TestSuite, suites: TestSuite[]): string {
  const names = [suite.name],
    seen = new Set([suite.id]);
  let parent = suite.parentSuiteId;
  while (parent && !seen.has(parent)) {
    seen.add(parent);
    const item = suites.find((entry) => entry.id === parent);
    if (!item) break;
    names.unshift(item.name);
    parent = item.parentSuiteId;
  }
  return names.join(' / ') + (suite.archivedAt ? ' (arquivada)' : '');
}
export function suiteDescendants(id: string, suites: TestSuite[]): Set<string> {
  const ids = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const suite of suites)
      if (suite.parentSuiteId && ids.has(suite.parentSuiteId) && !ids.has(suite.id)) {
        ids.add(suite.id);
        changed = true;
      }
  }
  return ids;
}
export function payloadFits(body: unknown): boolean {
  return new TextEncoder().encode(JSON.stringify(body)).byteLength <= 32 * 1024;
}

export interface AzureImportResult {
  importedCount: number;
  alreadyImported: boolean;
  cases: { azureId: string; id: string; sequence: number; title: string; suiteId: null }[];
}
