import { HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, inject, signal } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { Observable, catchError, forkJoin, map, of, switchMap, tap, throwError } from 'rxjs';
import { ApiResponse } from '../../core/api.models';
import { WorkspaceContext } from '../../core/workspace-context.service';
import { Project } from '../projects/project.models';
import { ProjectApi } from '../projects/project-api.service';
import { allPages, payloadFits } from '../test-cases/test-case.models';
import { OperationState } from '../workspaces/workspace-feedback';
import { GovernanceApi } from './governance-api.service';
import { GovernanceState } from './governance-feedback';
import { FrameworkProgress } from './framework-progress.models';
import {
  Kind,
  RecordItem,
  Framework,
  Assessment,
  Goal,
  Action,
  Section,
  Control,
  AssessedControl,
  SectionMutation,
  ControlMutation,
} from './governance.models';
export interface GovernanceView {
  item: RecordItem;
  sections: Section[];
  controls: Control[];
  assessed: AssessedControl[];
  project: Project | null;
  progress?: FrameworkProgress | null;
  linkedGoal?: Goal | null;
}
export type MutationResult = RecordItem | SectionMutation | ControlMutation;
export class GovernanceSession {
  private readonly api = inject(GovernanceApi);
  private readonly projects = inject(ProjectApi);
  private readonly context = inject(WorkspaceContext);
  private readonly destroy = inject(DestroyRef);
  readonly state = new GovernanceState(this.destroy);
  readonly read = new OperationState(this.destroy);
  readonly view = signal<GovernanceView>(null!);
  readonly latest = signal<GovernanceView | null>(null);
  readonly ready = signal(false);
  refreshExtras?: () => Observable<unknown>;
  constructor(
    readonly kind: Kind,
    initial: RecordItem,
    private readonly changed: () => void,
  ) {
    this.view.set({ item: initial, sections: [], controls: [], assessed: [], project: null });
  }
  item() {
    return this.view().item;
  }
  can(permission: string) {
    return this.context.selected()?.id === this.item().workspaceId && this.context.can(permission);
  }
  locked() {
    return (
      !this.ready() ||
      this.state.busy() ||
      this.state.blocked() ||
      !!this.state.wait() ||
      this.read.busy() ||
      !!this.read.error() ||
      !!this.read.wait()
    );
  }
  manageable() {
    return (
      this.can('governance.manage') &&
      this.context.selected()?.status === 'ACTIVE' &&
      !this.locked() &&
      this.view().project?.status !== 'ARCHIVED'
    );
  }
  canAssess() {
    return (
      this.can('governance.assess') &&
      this.context.selected()?.status === 'ACTIVE' &&
      !this.locked()
    );
  }
  assessable() {
    return this.canAssess() && (this.item() as Assessment).status === 'IN_PROGRESS';
  }
  private linkedGoal(item: RecordItem): Observable<Goal | null> {
    let goal: Observable<Goal | null> = of(null);
    if (this.kind === 'goals') goal = of(item as Goal);
    else if (this.kind === 'actions' && (item as Action).goalId)
      goal = this.api
        .get(item.workspaceId, 'goals', (item as Action).goalId!)
        .pipe(map((r) => r.data));
    return goal;
  }
  private project(goal: Goal | null): Observable<Project | null> {
    return of(goal).pipe(
      switchMap((g) =>
        g?.projectId
          ? this.projects.get(g.workspaceId, g.projectId).pipe(
              map((r) => r.data),
              catchError((error: unknown) => {
                if (
                  error instanceof HttpErrorResponse &&
                  [403, 404].includes(error.status) &&
                  this.context.selected()?.id === goal!.workspaceId
                ) {
                  this.context.selected.set(null);
                  this.context.notice.set(
                    'O acesso ao projeto vinculado mudou. Atualize o acesso ao Workspace.',
                  );
                  this.context.accessChanged.next();
                }
                return throwError(() => error);
              }),
            )
          : of(null),
      ),
    );
  }
  private fetch() {
    const i = this.item(),
      w = i.workspaceId;
    return this.api.get(w, this.kind, i.id).pipe(
      switchMap((r) =>
        forkJoin({
          item: of(r.data),
          sections:
            this.kind === 'frameworks'
              ? allPages((page) =>
                  this.api.sections(w, i.id, { page, size: 100, sort: 'position,asc' }),
                )
              : of([] as Section[]),
          controls:
            this.kind === 'frameworks'
              ? allPages((page) =>
                  this.api.controls(w, i.id, { page, size: 100, sort: 'creationOrder,asc' }),
                )
              : of([] as Control[]),
          assessed:
            this.kind === 'assessments'
              ? allPages((page) =>
                  this.api.assessedControls(w, i.id, { page, size: 100, sort: 'controlId,asc' }),
                )
              : of([] as AssessedControl[]),
          progress:
            this.kind === 'assessments'
              ? this.api
                  .progress(w, (r.data as Assessment).frameworkId, i.id)
                  .pipe(map((result) => result.data))
              : of(null),
        }),
      ),
      switchMap((view) =>
        this.linkedGoal(view.item).pipe(
          switchMap((goal) =>
            this.project(goal).pipe(
              map((project) => ({
                ...view,
                project,
                linkedGoal: this.kind === 'actions' ? goal : null,
              })),
            ),
          ),
        ),
      ),
      tap((view) => {
        if (view.progress?.assessment && view.progress.assessment.version !== view.item.version) {
          throw new HttpErrorResponse({
            status: 409,
            error: { code: 'GOVERNANCE_VERSION_CONFLICT' },
          });
        }
      }),
      switchMap((view) =>
        this.refreshExtras ? this.refreshExtras().pipe(map(() => view)) : of(view),
      ),
    );
  }
  reload() {
    if (this.state.busy() || this.read.busy() || this.read.wait() || !this.can('governance.read'))
      return;
    this.latest.set(null);
    this.read.run(this.fetch(), (view) => {
      if (this.state.blocked()) this.latest.set(view);
      else {
        this.view.set(view);
        this.ready.set(true);
      }
    });
  }
  review() {
    const v = this.latest();
    if (!v || this.read.busy() || this.read.wait()) return;
    this.view.set(v);
    this.ready.set(true);
    this.latest.set(null);
    this.state.blocked.set(false);
    this.state.error.set('');
    this.changed();
  }
  write(
    request: Observable<ApiResponse<MutationResult>>,
    body: unknown,
    closed: () => void,
    form?: FormGroup,
  ) {
    if (this.locked()) return;
    if (!payloadFits(body)) {
      this.state.error.set('O conteúdo excede 32 KiB. Reduza os textos.');
      return;
    }
    const previous = this.kind === 'actions' ? (this.item() as Action) : null;
    let affected: string[] = [];
    this.state.run(
      request.pipe(
        tap((r) => {
          if (
            previous &&
            'goalId' in r.data &&
            (previous.goalId !== r.data.goalId || previous.status !== r.data.status)
          ) {
            affected = [previous.goalId, r.data.goalId].filter((id): id is string => !!id);
          }
          this.view.update((v) => ({
            ...v,
            item:
              'frameworkVersion' in r.data
                ? { ...v.item, version: r.data.frameworkVersion }
                : r.data,
          }));
          this.ready.set(false);
          this.changed();
        }),
        switchMap(() =>
          this.fetch().pipe(
            switchMap((view) =>
              affected.length && this.can('governance.read')
                ? this.api.refreshActionGoals(this.item().workspaceId, affected).pipe(
                    map((goals) => ({
                      ...view,
                      linkedGoal:
                        goals.find((goal) => goal.id === (view.item as Action).goalId) ??
                        view.linkedGoal,
                    })),
                  )
                : of(view),
            ),
            catchError((error) => {
              this.state.blocked.set(true);
              return throwError(() => error);
            }),
          ),
        ),
      ),
      (view) => {
        this.view.set(view);
        this.ready.set(true);
        this.latest.set(null);
        closed();
        this.state.success.set('Alteração confirmada e dados atualizados.');
      },
      form,
    );
  }
  framework() {
    return this.item() as Framework;
  }
  assessment() {
    return this.item() as Assessment;
  }
}
