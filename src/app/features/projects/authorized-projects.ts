import { Injectable, inject } from '@angular/core';
import { catchError, from, map, mergeMap, of, toArray } from 'rxjs';
import { ProjectApi } from './project-api.service';
import { Project } from './project.models';
import { allPages } from '../test-cases/test-case.models';
import { Workspace } from '../workspaces/workspace.models';
import { workspaceError } from '../workspaces/workspace-feedback';

export interface NamedProject extends Project {
  workspaceName: string;
}
@Injectable({ providedIn: 'root' })
export class AuthorizedProjects {
  private readonly api = inject(ProjectApi);
  list(workspaces: Workspace[]) {
    return from(
      workspaces.filter(
        (w) => w.status === 'ACTIVE' && (!w.permissions || w.permissions.includes('project.read')),
      ),
    ).pipe(
      mergeMap(
        (workspace) =>
          allPages((page) =>
            this.api.list(workspace.id, {
              page,
              size: 100,
              status: 'ALL',
              sort: 'name,asc',
            }),
          ).pipe(
            map((projects) => ({
              projects: projects.map((project) => ({ ...project, workspaceName: workspace.name })),
              issue: '',
            })),
            catchError((error) =>
              of({
                projects: [] as NamedProject[],
                issue: `${workspace.name}: ${workspaceError(error)}`,
              }),
            ),
          ),
        4,
      ),
      toArray(),
      map((results) => ({
        projects: results
          .flatMap((result) => result.projects)
          .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR') || a.id.localeCompare(b.id)),
        issues: results.map((result) => result.issue).filter(Boolean),
      })),
    );
  }
}
