import { DefectStatus } from '../defects/defect.models';
import { TestResult } from '../execution/execution.models';
import { DashboardFrameworkGovernance } from '../governance/framework-progress.models';
import { GoalActionProgress } from '../governance/governance.models';

export type DashboardPeriod = 7 | 30 | 90 | 'ALL';
export type DashboardModule =
  'TEST_CASES' | 'EXECUTION' | 'DEFECTS' | 'GOVERNANCE' | 'PROJECT' | 'WORKSPACE';
export interface DashboardMetric {
  value: number | null;
  previousValue: number | null;
}
export interface DashboardTarget {
  module: DashboardModule;
  workspaceId: string;
  projectId: string | null;
}
export interface DashboardOverview {
  frameworkGovernance?: DashboardFrameworkGovernance | null;
  generatedAt: string;
  period: {
    days: DashboardPeriod;
    supportedDays?: DashboardPeriod[];
    from: string | null;
    to: string;
    previousFrom: string | null;
    previousTo: string | null;
  };
  metrics: {
    testCases: DashboardMetric;
    activeTestCases?: DashboardMetric | null;
    executions: DashboardMetric;
    defects: DashboardMetric;
    coverage: DashboardMetric;
    automationCoverage?: DashboardMetric | null;
  };
  results: Record<TestResult, number> | null;
  defectsByStatus: Record<DefectStatus, number> | null;
  projects:
    | {
        id: string;
        workspaceId: string;
        workspaceName: string;
        key: string;
        name: string;
        status: 'ACTIVE' | 'ARCHIVED';
        activeTestCases?: number | null;
        automationCoverage?: number | null;
        progress: number | null;
        coverage: number | null;
      }[]
    | null;
  activity:
    | { id: string; title: string; context: string; occurredAt: string; target: DashboardTarget }[]
    | null;
  governance:
    | {
        id: string;
        workspaceId: string;
        name: string;
        frameworkName: string | null;
        frameworkId?: string | null;
        sectionId?: string | null;
        sectionName?: string | null;
        ownerDisplayName?: string | null;
        currentValue?: number | null;
        targetValue?: number;
        deadline?: string | null;
        calculatedAt?: string | null;
        progress: number | null;
        detail: string;
        actionProgress: GoalActionProgress;
        status: 'ACTIVE' | 'ACHIEVED' | 'MISSED' | 'CANCELLED';
      }[]
    | null;
  documents:
    | {
        id: string;
        workspaceId: string;
        name: string;
        versionLabel: string | null;
        updatedAt: string;
      }[]
    | null;
}

// Use existing product routes; the API never supplies arbitrary navigation URLs.
export function dashboardLink(target: DashboardTarget): string[] {
  const root = ['/workspaces', target.workspaceId];
  if (target.module === 'GOVERNANCE') return [...root, 'governance'];
  if (target.module === 'WORKSPACE') return root;
  if (!target.projectId) return root;
  const project = [...root, 'projects', target.projectId];
  const paths = {
    TEST_CASES: 'test-cases',
    EXECUTION: 'execution',
    DEFECTS: 'defects',
    PROJECT: '',
  };
  const suffix = paths[target.module];
  return suffix ? [...project, suffix] : project;
}
