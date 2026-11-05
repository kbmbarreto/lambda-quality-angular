import { EnvironmentCategory } from '../projects/project.models';
import { DefectStatus } from './defect.models';
export type BugCategory = EnvironmentCategory | 'UNSPECIFIED';
export const bugCategories: Record<BugCategory, string> = {
  HOMOLOGATION: 'Homologação',
  PRODUCTION: 'Produção',
  OTHER: 'Outro',
  UNSPECIFIED: 'Sem ambiente',
};
export interface DefectAnalyticsQuery {
  from: string;
  to: string;
  projectId?: string;
  category?: BugCategory;
}
export type CategoryCounts = Record<BugCategory, number>;
export interface DefectAnalytics {
  generatedAt: string;
  period: { from: string; to: string; dateField: 'createdAt'; timezone: 'UTC' };
  totalBugs: number;
  byStatus: Record<DefectStatus, number>;
  byCategory: CategoryCounts;
  monthly: { month: string; totalBugs: number; byCategory: CategoryCounts }[];
  byProject: {
    projectId: string;
    projectKey: string;
    projectName: string;
    totalBugs: number;
    byCategory: CategoryCounts;
  }[];
  byEnvironment: {
    projectId: string;
    environmentId: string | null;
    name: string | null;
    category: BugCategory;
    totalBugs: number;
  }[];
}
