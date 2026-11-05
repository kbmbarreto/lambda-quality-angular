import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { DashboardPeriod } from './dashboard.models';

export interface DashboardFilters {
  days: DashboardPeriod;
  workspaceId: string;
}
export const dashboardPreferencesKey = (userId: string) =>
  `lambda_quality_dashboard:v1:${encodeURIComponent(userId)}`;
const workspaceIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable({ providedIn: 'root' })
export class DashboardPreferences {
  private readonly doc = inject(DOCUMENT);
  read(userId: string | undefined): DashboardFilters {
    const defaults: DashboardFilters = { days: 30, workspaceId: '' };
    if (!userId) return defaults;
    try {
      const value: unknown = JSON.parse(
        this.doc.defaultView?.localStorage.getItem(dashboardPreferencesKey(userId)) ?? 'null',
      );
      if (!value || typeof value !== 'object') return defaults;
      const filters = value as Partial<DashboardFilters>;
      return {
        days: [7, 30, 90, 'ALL'].includes(filters.days!) ? filters.days! : 30,
        workspaceId:
          typeof filters.workspaceId === 'string' && workspaceIdPattern.test(filters.workspaceId)
            ? filters.workspaceId
            : '',
      };
    } catch {
      return defaults;
    }
  }
  save(userId: string | undefined, filters: DashboardFilters): boolean {
    if (!userId) return false;
    try {
      const storage = this.doc.defaultView?.localStorage;
      if (!storage) return false;
      storage.setItem(dashboardPreferencesKey(userId), JSON.stringify(filters));
      return true;
    } catch {
      return false;
    }
  }
}
