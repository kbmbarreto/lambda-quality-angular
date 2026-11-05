import { ListQuery } from '../workspaces/workspace.models';
export const frameworkStatuses = { DRAFT: 'Rascunho', ACTIVE: 'Ativo', ARCHIVED: 'Arquivado' };
export const assessmentStatuses = {
  DRAFT: 'Rascunho',
  IN_PROGRESS: 'Em andamento',
  CLOSED: 'Fechada',
};
export const complianceStatuses = {
  NOT_ASSESSED: 'Não avaliado',
  NOT_MET: 'Não atendido',
  PARTIALLY_MET: 'Parcialmente atendido',
  MET: 'Atendido',
  NOT_APPLICABLE: 'Não aplicável',
};
export const goalStatuses = {
  ACTIVE: 'Ativa',
  ACHIEVED: 'Atingida',
  MISSED: 'Não atingida no prazo',
  CANCELLED: 'Cancelada',
};
export const actionStatuses = {
  OPEN: 'Aberta',
  IN_PROGRESS: 'Em andamento',
  DONE: 'Concluída',
  CANCELLED: 'Cancelada',
};
export const goalTypes = {
  AUTOMATION_COVERAGE: 'Cobertura de automação',
  CRITICAL_DEFECTS: 'Defeitos críticos abertos',
  GOVERNANCE_SCORE: 'Índice interno de governança',
};
export const operators = {
  GT: 'Maior que',
  GTE: 'Maior ou igual a',
  EQ: 'Igual a',
  LTE: 'Menor ou igual a',
  LT: 'Menor que',
};
export type GoalType = keyof typeof goalTypes;
export type ComplianceStatus = keyof typeof complianceStatuses;
export type Kind = 'frameworks' | 'assessments' | 'goals' | 'actions';
export interface Versioned {
  id: string;
  workspaceId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}
export interface Framework extends Versioned {
  code: string;
  name: string;
  versionLabel: string;
  description: string | null;
  status: keyof typeof frameworkStatuses;
}
export interface Section {
  id: string;
  workspaceId: string;
  frameworkId: string;
  parentSectionId: string | null;
  code: string;
  name: string;
  description: string | null;
  position: number;
}
export interface Control {
  creationOrder: number;
  id: string;
  workspaceId: string;
  frameworkId: string;
  sectionId: string;
  code: string;
  title: string;
  description: string | null;
  weight: number;
  active: boolean;
}
export interface Assessment extends Versioned {
  frameworkId: string;
  name: string;
  status: keyof typeof assessmentStatuses;
  assessmentDate: string;
  frameworkSnapshot: Pick<
    Framework,
    'id' | 'code' | 'name' | 'versionLabel' | 'version' | 'description'
  > & { sections: Section[] };
  closedAt: string | null;
  createdBy: string;
  indicatorType: 'INTERNAL';
  index: {
    value: number | null;
    numerator: number;
    denominator: number;
    assessedControls: number;
    totalControls: number;
  };
}
export interface AssessedControl {
  id: string;
  workspaceId: string;
  frameworkId: string;
  assessmentId: string;
  controlId: string;
  controlSnapshot: Omit<Control, 'workspaceId' | 'frameworkId' | 'active' | 'creationOrder'> & {
    sectionPath: { id: string; code: string; name: string }[];
  };
  status: ComplianceStatus;
  score: number | null;
  justification: string | null;
  assessedBy: string | null;
  assessedAt: string | null;
}
export interface Evidence {
  id: string;
  workspaceId: string;
  controlAssessmentId: string;
  evidenceType: 'ATTACHMENT' | 'URL';
  referenceId: string | null;
  url: string | null;
  title: string;
  validUntil: string | null;
  attachmentSnapshot: {
    originalName: string;
    contentType: string;
    sizeBytes: number;
    checksum: string;
  } | null;
  createdBy: string;
  createdAt: string;
  attachmentAvailable: boolean | null;
}
export interface GoalActionProgress {
  basis: 'ACTIONS';
  totalActions: number;
  completedActions: number;
  cancelledActions: number;
  percent: number | null;
}
export interface Goal extends Versioned {
  actionProgress: GoalActionProgress;
  projectId: string | null;
  frameworkId: string | null;
  sectionId?: string | null;
  ownerMemberId?: string | null;
  ownerDisplayName?: string | null;
  sectionName?: string | null;
  sectionPath?: { id: string; code: string; name: string }[];
  name: string;
  description: string | null;
  goalType: GoalType;
  operator: keyof typeof operators;
  targetValue: number;
  deadline: string | null;
  status: keyof typeof goalStatuses;
  lastResult: {
    value: number | null;
    numerator: number | null;
    denominator: number | null;
    calculatedAt: string;
    sourceIds: string[];
    section?: {
      id: string;
      name: string;
      path: { id: string; code: string; name: string }[];
    } | null;
    reason?:
      | 'NO_CLOSED_ASSESSMENT'
      | 'SECTION_NOT_IN_SNAPSHOT'
      | 'EMPTY_SECTION'
      | 'NO_APPLICABLE_CONTROLS';
  } | null;
  createdBy: string;
}
export interface Action extends Versioned {
  controlAssessmentId: string | null;
  goalId: string | null;
  title: string;
  description: string | null;
  ownerMemberId: string | null;
  status: keyof typeof actionStatuses;
  dueDate: string | null;
  completedAt: string | null;
  createdBy: string;
}
export interface Records {
  frameworks: Framework;
  assessments: Assessment;
  goals: Goal;
  actions: Action;
}
export type RecordItem = Records[Kind];
export interface FrameworkBody {
  code: string;
  name: string;
  versionLabel: string;
  description?: string | null;
}
export interface SectionBody {
  version: number;
  code: string;
  name: string;
  description?: string | null;
  parentSectionId?: string | null;
  position: number;
}
export interface ControlBody {
  version: number;
  sectionId: string;
  code: string;
  title: string;
  description?: string | null;
  weight?: number;
  active?: boolean;
}
export interface AssessmentBody {
  frameworkId: string;
  name: string;
  assessmentDate: string;
}
export interface GoalBody {
  projectId?: string | null;
  frameworkId?: string | null;
  sectionId?: string | null;
  ownerMemberId?: string | null;
  name: string;
  description?: string | null;
  goalType: GoalType;
  operator: keyof typeof operators;
  targetValue: number;
  deadline?: string | null;
}
export interface ActionBody {
  controlAssessmentId?: string | null;
  goalId?: string | null;
  title: string;
  description?: string | null;
  ownerMemberId?: string | null;
  dueDate?: string | null;
}
export interface Bodies {
  frameworks: FrameworkBody;
  assessments: AssessmentBody;
  goals: GoalBody;
  actions: ActionBody;
}
export interface Updates {
  frameworks: Partial<FrameworkBody> & { version: number; status?: Framework['status'] };
  goals: Partial<GoalBody> & { version: number; status?: 'ACTIVE' | 'CANCELLED' };
  actions: Partial<Omit<ActionBody, 'controlAssessmentId'>> & {
    version: number;
    status?: 'OPEN' | 'IN_PROGRESS' | 'CANCELLED';
  };
}
export interface SectionMutation {
  section: Section;
  frameworkVersion: number;
}
export interface ControlMutation {
  control: Control;
  frameworkVersion: number;
}
export interface EvidenceBody {
  version: number;
  evidenceType: Evidence['evidenceType'];
  referenceId?: string | null;
  url?: string | null;
  title: string;
  validUntil?: string | null;
}
export interface Query extends Pick<ListQuery, 'page' | 'size' | 'sort' | 'q' | 'status'> {
  assessmentId?: string;
  frameworkId?: string;
  projectId?: string;
  goalId?: string;
  controlAssessmentId?: string;
  sectionId?: string;
  active?: boolean;
}
export interface Metrics {
  goalTypes: GoalType[];
  indicatorType: 'INTERNAL';
}
export interface Dashboard {
  indicatorType: 'INTERNAL';
  frameworks: number;
  assessments: { draft: number; inProgress: number; closed: number };
  latestAssessments: {
    frameworkId: string;
    assessmentId: string;
    frameworkName: string;
    closedAt: string;
    index: number | null;
  }[];
  goals: { active: number; achieved: number; missed: number; cancelled: number };
  actions: { open: number; inProgress: number; done: number; cancelled: number };
  attention: { notMetControls: number; partiallyMetControls: number; expiredEvidence: number };
}
export const kindLabels: Record<Kind, string> = {
  frameworks: 'Frameworks',
  assessments: 'Avaliações',
  goals: 'Metas',
  actions: 'Ações de melhoria',
};
export const statuses = {
  frameworks: frameworkStatuses,
  assessments: assessmentStatuses,
  goals: goalStatuses,
  actions: actionStatuses,
};
export function recordName(item: RecordItem): string {
  return 'title' in item ? item.title : item.name;
}
export function sectionDescendants(id: string, rows: Section[]): Set<string> {
  const ids = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows)
      if (row.parentSectionId && ids.has(row.parentSectionId) && !ids.has(row.id)) {
        ids.add(row.id);
        changed = true;
      }
  }
  return ids;
}
export function sectionPath(id: string, rows: Section[]): string {
  const path: string[] = [];
  const seen = new Set<string>();
  let row = rows.find((s) => s.id === id);
  while (row && !seen.has(row.id)) {
    seen.add(row.id);
    path.unshift(`${row.code} · ${row.name}`);
    row = rows.find((s) => s.id === row!.parentSectionId);
  }
  return path.join(' / ');
}
export function validSectionMove(
  id: string | null,
  parent: string | null,
  rows: Section[],
): boolean {
  const parents = new Map(rows.map((r) => [r.id, r.parentSectionId]));
  if (parent && !parents.has(parent)) return false;
  parents.set(id ?? 'new', parent);
  for (const row of parents.keys()) {
    let ancestor = parents.get(row),
      depth = 1;
    const seen = new Set([row]);
    while (ancestor) {
      if (!parents.has(ancestor) || seen.has(ancestor) || ++depth > 20) return false;
      seen.add(ancestor);
      ancestor = parents.get(ancestor);
    }
  }
  return true;
}
