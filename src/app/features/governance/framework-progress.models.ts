import { Assessment, ComplianceStatus } from './governance.models';

export interface ProgressSummary {
  state: 'EMPTY' | 'NOT_APPLICABLE' | 'AVAILABLE';
  totalControls: number;
  applicableControls: number;
  assessedControls: number;
  counts: Record<ComplianceStatus, number>;
  index: { value: number | null; numerator: number; denominator: number };
  completionPercent: number | null;
  assessmentPercent: number | null;
  completed: boolean;
}
export interface FrameworkProgress {
  generatedAt: string;
  indicatorType: 'INTERNAL';
  state: 'NO_ASSESSMENT' | Assessment['status'];
  framework: { id: string; code: string; name: string; version: number };
  assessment: null | {
    id: string;
    name: string;
    status: Assessment['status'];
    version: number;
    definitionVersion: number;
    assessmentDate: string;
    closedAt: string | null;
  };
  definitionVersionDiffers: boolean;
  summary: ProgressSummary | null;
  sections: {
    id: string;
    parentSectionId: string | null;
    code: string;
    name: string;
    position: number;
    direct: ProgressSummary;
    subtree: ProgressSummary;
  }[];
}
export interface DashboardFrameworkGovernance {
  indicatorType: 'INTERNAL';
  generatedAt: string;
  frameworkCount: number;
  frameworksWithAssessment: number;
  overall: ProgressSummary | null;
  frameworks: {
    workspaceId: string;
    workspaceName: string;
    frameworkId: string;
    frameworkName: string;
    state: FrameworkProgress['state'];
    assessment: FrameworkProgress['assessment'];
    definitionVersionDiffers: boolean;
    summary: ProgressSummary | null;
    sections: { id: string; code: string; name: string; summary: ProgressSummary }[];
  }[];
  attention: {
    notAssessedControls: number;
    notMetControls: number;
    partiallyMetControls: number;
    expiredEvidence: number;
    upcomingGoals: number;
  };
}
export function progressLabel(summary: ProgressSummary | null | undefined): string {
  if (!summary) return 'Sem avaliação';
  if (summary.state === 'EMPTY') return 'Sem itens';
  if (summary.index.value === null) return 'Não aplicável';
  return `${summary.index.value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
}
