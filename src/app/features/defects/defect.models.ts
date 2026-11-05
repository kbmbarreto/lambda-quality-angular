import { CaseDefinition } from '../test-cases/test-case.models';
import { ListQuery } from '../workspaces/workspace.models';
import { EnvironmentCategory } from '../projects/project.models';
export const defectStatuses = {
  OPEN: 'Aberto',
  IN_PROGRESS: 'Em andamento',
  RESOLVED: 'Resolvido',
  CLOSED: 'Fechado',
  REJECTED: 'Rejeitado',
};
export type DefectStatus = keyof typeof defectStatuses;
export type DefectSeverity = CaseDefinition['severity'];
export interface Defect {
  id: string;
  workspaceId: string;
  projectId: string;
  sequence: number;
  humanId: string;
  title: string;
  description: string | null;
  severity: DefectSeverity;
  status: DefectStatus;
  testRunCaseId: string | null;
  testRunId: string | null;
  externalSystem: string | null;
  externalIssueId: string | null;
  externalUrl: string | null;
  version: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  attachmentIds: string[];
  environmentId?: string | null;
  environmentSnapshot?: { name: string; category: EnvironmentCategory } | null;
}
export interface DefectQuery extends ListQuery {
  severity?: DefectSeverity;
  testRunCaseId?: string;
  environmentId?: string;
}
export interface DefectFields {
  title: string;
  description?: string | null;
  severity?: DefectSeverity;
  environmentId?: string | null;
}
export interface CreateDefect extends DefectFields {
  testRunCaseId?: string | null;
  attachmentIds?: string[];
}
export interface FailureDefect extends Partial<DefectFields> {
  testRunCaseId: string;
  attachmentIds?: string[];
}
export interface UpdateDefect extends Partial<DefectFields> {
  version: number;
  status?: DefectStatus;
  /** Proposed additive contract; only sent after the history endpoint is available. */
  comment?: string;
}
export interface ExternalIssue {
  version: number;
  externalSystem: string;
  externalIssueId: string;
  externalUrl: string;
}
export interface DefectNavigation {
  defectId: string;
  runId: string;
  runCaseId: string;
  testRunCaseId: string;
  key: string;
}
export function validExternalUrl(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    !value.length ||
    value.length > 2048 ||
    /[\s\\]/u.test(value) ||
    Array.from(value).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  )
    return false;
  try {
    const url = new URL(value);
    return (
      /^https?:\/\//i.test(value) &&
      ['http:', 'https:'].includes(url.protocol) &&
      !!url.hostname &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export interface DefectInventoryRow extends Pick<
  Defect,
  | 'id'
  | 'workspaceId'
  | 'projectId'
  | 'sequence'
  | 'humanId'
  | 'title'
  | 'status'
  | 'severity'
  | 'environmentId'
  | 'environmentSnapshot'
  | 'version'
  | 'createdAt'
  | 'updatedAt'
> {
  workspaceName: string;
  projectName: string;
  projectKey: string;
  projectStatus: 'ACTIVE' | 'ARCHIVED';
}
export interface DefectInventoryQuery extends ListQuery {
  workspaceId?: string;
  projectId?: string;
  severity?: DefectSeverity;
}
