import { HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription, finalize, map, of, switchMap } from 'rxjs';
import { WorkspaceContext } from '../../core/workspace-context.service';
import { ProjectContext } from '../../core/project-context.service';
import { WorkspaceApi } from '../workspaces/workspace-api.service';
import { OperationState } from '../workspaces/workspace-feedback';
import { ProjectApi } from './project-api.service';

@Injectable()
export class ProjectScope {
  readonly workspace = inject(WorkspaceContext);
  readonly context = inject(ProjectContext);
  private readonly workspaceApi = inject(WorkspaceApi);
  private readonly api = inject(ProjectApi);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly workspaceId = signal('');
  readonly projectId = signal('');
  readonly state = new OperationState(this.destroyRef);
  private request?: Subscription;
  private accessRefreshUsed = false;
  constructor() {
    inject(ActivatedRoute)
      .paramMap.pipe(takeUntilDestroyed())
      .subscribe((params) => {
        this.workspace.clear();
        this.context.clear();
        this.workspaceId.set(params.get('workspaceId') ?? '');
        this.projectId.set(params.get('projectId') ?? '');
        this.refresh();
      });
    this.context.accessChanged.pipe(takeUntilDestroyed()).subscribe((scope) => {
      if (
        scope.workspaceId === this.workspaceId() &&
        (!scope.projectId || scope.projectId === this.projectId())
      )
        this.refresh(false);
    });
    this.workspace.accessChanged.pipe(takeUntilDestroyed()).subscribe(() => this.refresh(false));
    this.destroyRef.onDestroy(() => {
      this.workspace.selected.set(null);
      this.context.selected.set(null);
    });
  }
  refresh(manual = true): void {
    this.request?.unsubscribe();
    this.workspace.selected.set(null);
    this.context.selected.set(null);
    if (manual) this.accessRefreshUsed = false;
    else if (this.accessRefreshUsed) {
      this.state.error.set(
        'O acesso continua indisponível. Atualize o acesso manualmente ou solicite permissão.',
      );
      return;
    } else this.accessRefreshUsed = true;
    if (this.state.wait()) return;
    const workspaceId = this.workspaceId(),
      projectId = this.projectId();
    let stage: 'workspace' | 'project' = 'workspace';
    this.state.busy.set(true);
    this.state.error.set('');
    this.request = this.workspaceApi
      .getWorkspace(workspaceId)
      .pipe(
        switchMap((response) => {
          stage = 'project';
          return projectId
            ? this.api
                .get(workspaceId, projectId)
                .pipe(map((project) => ({ workspace: response.data, project: project.data })))
            : of({ workspace: response.data, project: null });
        }),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.state.busy.set(false)),
      )
      .subscribe({
        next: (response) => {
          this.workspace.selected.set(response.workspace);
          this.context.selected.set(response.project);
        },
        error: (error) => {
          this.state.fail(error);
          if (error instanceof HttpErrorResponse && [403, 404].includes(error.status)) {
            this.context.notice.set(
              'O projeto não está disponível para sua conta. Selecione outro projeto ou solicite acesso.',
            );
            if (stage === 'workspace') {
              this.workspace.notice.set(
                'O Workspace não está disponível para sua conta. Selecione outro Workspace.',
              );
              void this.router.navigate(['/projetos']);
            } else void this.router.navigate(['/workspaces', workspaceId, 'projects']);
          }
        },
      });
  }
}
