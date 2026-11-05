import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription, finalize } from 'rxjs';
import { WorkspaceContext } from '../../core/workspace-context.service';
import { ProjectContext } from '../../core/project-context.service';
import { WorkspaceApi } from '../workspaces/workspace-api.service';
import { OperationState } from '../workspaces/workspace-feedback';
@Injectable()
export class GovernanceScope {
  readonly context = inject(WorkspaceContext);
  private readonly api = inject(WorkspaceApi);
  private readonly router = inject(Router);
  private readonly destroy = inject(DestroyRef);
  readonly id = signal('');
  readonly state = new OperationState(this.destroy);
  private request?: Subscription;
  private refreshed = false;
  constructor() {
    const projects = inject(ProjectContext);
    projects.clear();
    projects.accessChanged.pipe(takeUntilDestroyed()).subscribe((scope) => {
      if (scope.workspaceId === this.id()) this.refresh(false);
    });
    inject(ActivatedRoute)
      .paramMap.pipe(takeUntilDestroyed())
      .subscribe((params) => {
        this.context.clear();
        this.id.set(params.get('workspaceId') ?? '');
        this.refresh();
      });
    this.context.accessChanged.pipe(takeUntilDestroyed()).subscribe(() => this.refresh(false));
    this.destroy.onDestroy(() => this.context.clear());
  }
  refresh(manual = true) {
    this.request?.unsubscribe();
    this.context.selected.set(null);
    if (manual) this.refreshed = false;
    else if (this.refreshed) {
      this.state.error.set('O acesso continua indisponível. Atualize o acesso manualmente.');
      return;
    } else this.refreshed = true;
    if (this.state.wait()) return;
    this.state.busy.set(true);
    this.state.error.set('');
    this.request = this.api
      .getWorkspace(this.id())
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => this.state.busy.set(false)),
      )
      .subscribe({
        next: (r) => this.context.selected.set(r.data),
        error: (error) => {
          this.state.fail(error);
          if (error instanceof HttpErrorResponse && [403, 404].includes(error.status)) {
            this.context.notice.set(
              'O Workspace não está disponível para sua conta. Selecione outro Workspace.',
            );
            void this.router.navigate(['/governanca']);
          }
        },
      });
  }
}
