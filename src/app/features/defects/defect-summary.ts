import { DefectInventoryQuery, DefectInventoryRow, DefectStatus } from './defect.models';
import { BugCategory, CategoryCounts } from './defect-analytics.models';

export type DefectSummaryQuery = Pick<
  DefectInventoryQuery,
  'workspaceId' | 'projectId' | 'q' | 'status' | 'severity'
>;
export interface DefectInventorySummary {
  generatedAt: string;
  totalBugs: number;
  byStatus: Record<DefectStatus, number>;
  byCategory: CategoryCounts;
  resolutionTime: {
    averageHours: number | null;
    sampleSize: number;
    basis: 'CREATED_TO_RESOLVED' | 'IN_PROGRESS_TO_RESOLVED';
  } | null;
}

export function summarizeDefects(rows: DefectInventoryRow[]): DefectInventorySummary {
  const byStatus = { OPEN: 0, IN_PROGRESS: 0, RESOLVED: 0, CLOSED: 0, REJECTED: 0 };
  const byCategory = { HOMOLOGATION: 0, PRODUCTION: 0, OTHER: 0, UNSPECIFIED: 0 };
  for (const row of rows) {
    byStatus[row.status]++;
    const category: BugCategory = row.environmentSnapshot?.category ?? 'UNSPECIFIED';
    byCategory[category]++;
  }
  return {
    generatedAt: new Date().toISOString(),
    totalBugs: rows.length,
    byStatus,
    byCategory,
    resolutionTime: null,
  };
}
