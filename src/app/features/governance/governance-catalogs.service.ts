import { Injectable, inject } from '@angular/core';
import { forkJoin, of, map } from 'rxjs';
import { ProjectApi } from '../projects/project-api.service';
import { WorkspaceApi } from '../workspaces/workspace-api.service';
import { Workspace } from '../workspaces/workspace.models';
import { allPages } from '../test-cases/test-case.models';
import { GovernanceApi } from './governance-api.service';
import { Kind } from './governance.models';
import { emptyCatalogs } from './governance-fields';
@Injectable({ providedIn: 'root' })
export class GovernanceCatalogs {
  private readonly api = inject(GovernanceApi);
  private readonly projects = inject(ProjectApi);
  private readonly workspaceApi = inject(WorkspaceApi);
  load(w: Workspace, kind: Kind, frameworkId?: string | null) {
    const read = w.permissions?.includes('governance.read');
    return forkJoin({
      frameworks:
        read && ['assessments', 'goals'].includes(kind)
          ? allPages((page) =>
              this.api.list(w.id, 'frameworks', {
                page,
                size: 100,
                status: 'ALL',
                sort: 'name,asc',
              }),
            )
          : of([]),
      projects:
        kind === 'goals' && w.permissions?.includes('project.read')
          ? allPages((page) =>
              this.projects.list(w.id, { page, size: 100, status: 'ACTIVE', sort: 'name,asc' }),
            )
          : of([]),
      members:
        ['actions', 'goals'].includes(kind) && w.permissions?.includes('workspace.read')
          ? allPages((page) =>
              this.workspaceApi.list(w.id, 'members', { page, size: 100, status: 'ACTIVE' }),
            ).pipe(
              map((rows) =>
                rows.filter((m) => m.status === 'ACTIVE' && m.user.status === 'ACTIVE'),
              ),
            )
          : of([]),
      goals:
        read && kind === 'actions'
          ? allPages((page) =>
              this.api.list(w.id, 'goals', { page, size: 100, status: 'ALL', sort: 'name,asc' }),
            )
          : of([]),
      metrics:
        read && kind === 'goals'
          ? this.api.metrics(w.id).pipe(map((r) => r.data))
          : of(emptyCatalogs.metrics),
      sections: read && kind === 'goals' && frameworkId ? this.sections(w.id, frameworkId) : of([]),
    });
  }
  sections(workspaceId: string, frameworkId: string) {
    return allPages((page) =>
      this.api.sections(workspaceId, frameworkId, { page, size: 100, sort: 'position,asc' }),
    );
  }
}
