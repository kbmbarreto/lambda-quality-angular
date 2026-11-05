import { Component, DestroyRef, OnInit, input, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, RouterLink, convertToParamMap } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { of, map } from 'rxjs';
import { validResourceId } from '../../shared/resource-id';
import { AppShell } from '../../shared/app-shell';
import { Workspace } from '../workspaces/workspace.models';
import { OperationState } from '../workspaces/workspace-feedback';
import { GovernanceApi } from './governance-api.service';
import { GovernanceScope } from './governance-scope';
import { Kind, RecordItem, kindLabels } from './governance.models';
import { GovernanceCollection } from './governance-collection';
import { GovernanceDashboard } from './governance-dashboard';
import { GovernanceDetail, Creation } from './governance-detail';
import { GovernanceCreate } from './governance-create';
@Component({
  selector: 'app-governance-panel',
  imports: [GovernanceCollection, GovernanceDashboard, GovernanceDetail, GovernanceCreate],
  template: `<nav class="workspace-tabs" aria-label="Seções de governança">
      @if (canRead()) {
        <button
          type="button"
          [class.active]="tab() === 'dashboard'"
          [attr.aria-current]="tab() === 'dashboard' ? 'page' : null"
          [disabled]="navigationBusy() || !!creating()"
          (click)="selectTab('dashboard')"
        >
          Visão geral
        </button>
      }
      @for (kind of kinds; track kind) {
        @if (available(kind)) {
          <button
            type="button"
            [class.active]="tab() === kind"
            [attr.aria-current]="tab() === kind ? 'page' : null"
            [disabled]="navigationBusy() || !!creating()"
            (click)="selectTab(kind)"
          >
            {{ labels[kind] }}
          </button>
        }
      }
    </nav>
    @if (state.error()) {
      <p class="message error" role="alert">
        {{ state.error() }}
        @if (state.wait()) {
          Aguarde {{ state.wait() }}s.
        }
      </p>
    }
    @if (state.success()) {
      <p class="message success" role="status">{{ state.success() }}</p>
    }
    @if (state.busy()) {
      <p role="status">Carregando registro…</p>
    }
    @if (selected(); as record) {
      @for (item of [record]; track item.kind + ':' + item.data.id) {
        <app-governance-detail
          [kind]="item.kind"
          [initial]="item.data"
          [initialAssessmentId]="sourceAssessmentId()"
          [initialTracking]="tracking()"
          (closed)="selected.set(null)"
          (create)="beginCreation($event)"
          (opened)="openId($event.kind, $event.id)"
        />
      }
    } @else {
      @if (tab() === 'dashboard') {
        <app-governance-dashboard
          [workspaceId]="workspace().id"
          (assessment)="openId('assessments', $event)"
        />
      } @else {
        @for (
          entry of [{ kind: collectionKind(), generation: collectionGeneration() }];
          track entry.kind + ':' + entry.generation
        ) {
          <app-governance-collection
            [kind]="entry.kind"
            [workspace]="workspace()"
            [blocked]="state.busy() || !!state.wait()"
            [creationBlocked]="uncertainCreation()"
            (loaded)="uncertainCreation.set(false)"
            (opened)="open(entry.kind, $event)"
            (create)="beginCreation({ kind: entry.kind })"
          />
        }
      }
    }
    @if (creating(); as c) {
      <app-governance-create
        [workspace]="workspace()"
        [kind]="c.kind"
        [links]="c.links ?? {}"
        (created)="created(c.kind, $event)"
        (closed)="closeCreation(c.kind, $event)"
      />
    }`,
})
export class GovernancePanel implements OnInit {
  readonly workspace = input.required<Workspace>();
  readonly navigation = input<{
    frameworkId: string;
    assessmentId: string;
    goalId: string;
    key: string;
  }>({ frameworkId: '', assessmentId: '', goalId: '', key: '' });
  readonly sourceAssessmentId = signal('');
  readonly tracking = signal(false);
  private readonly api = inject(GovernanceApi);
  readonly state = new OperationState(inject(DestroyRef));
  readonly tab = signal<Kind | 'dashboard'>('dashboard');
  readonly kinds: Kind[] = ['frameworks', 'assessments', 'goals', 'actions'];
  readonly labels = kindLabels;
  readonly selected = signal<{ kind: Kind; data: RecordItem } | null>(null);
  readonly creating = signal<Creation | null>(null);
  readonly detail = viewChild(GovernanceDetail);
  readonly uncertainCreation = signal(false);
  readonly collectionGeneration = signal(0);
  ngOnInit() {
    if (!this.canRead())
      this.tab.set(
        this.workspace().permissions?.includes('governance.manage') ? 'frameworks' : 'assessments',
      );
    const nav = this.navigation();
    if ([nav.frameworkId, nav.assessmentId, nav.goalId].some((id) => id && !validResourceId(id))) {
      this.state.error.set(
        'O link de governança contém um identificador inválido. Selecione um registro pela lista.',
      );
      return;
    }
    if (nav.frameworkId) {
      this.sourceAssessmentId.set(nav.assessmentId);
      this.tracking.set(true);
      this.openId('frameworks', nav.frameworkId);
    } else if (nav.goalId) this.openId('goals', nav.goalId);
  }
  canRead() {
    return this.workspace().permissions?.includes('governance.read');
  }
  available(kind: Kind) {
    return (
      this.canRead() ||
      this.workspace().permissions?.includes(
        kind === 'assessments' ? 'governance.assess' : 'governance.manage',
      )
    );
  }
  collectionKind() {
    return this.tab() as Kind;
  }
  navigationBusy() {
    const detail = this.detail();
    return this.state.busy() || !!detail?.navigationBusy() || !!detail?.catalogRead.busy();
  }
  selectTab(tab: Kind | 'dashboard') {
    if (this.navigationBusy() || this.creating()) return;
    this.selected.set(null);
    this.sourceAssessmentId.set('');
    this.tracking.set(false);
    this.state.error.set('');
    this.state.success.set('');
    this.tab.set(tab);
  }
  open(kind: Kind, item: RecordItem) {
    this.sourceAssessmentId.set('');
    this.tracking.set(false);
    this.openId(kind, item.id);
  }
  openId(kind: Kind, id: string) {
    if (!this.canRead() || this.state.busy()) return;
    this.state.run(this.api.get(this.workspace().id, kind, id), (r) => {
      this.tab.set(kind);
      this.selected.set({ kind, data: r.data });
    });
  }
  beginCreation(c: Creation) {
    if (
      this.uncertainCreation() ||
      this.state.busy() ||
      this.creating() ||
      this.workspace().status !== 'ACTIVE' ||
      !this.workspace().permissions?.includes(
        c.kind === 'assessments' ? 'governance.assess' : 'governance.manage',
      )
    )
      return;
    this.creating.set(c);
  }
  created(kind: Kind, data: RecordItem) {
    this.creating.set(null);
    this.tab.set(kind);
    this.state.success.set('Registro criado com sucesso.');
    if (this.canRead()) this.selected.set({ kind, data });
    else this.selected.set(null);
  }
  closeCreation(kind: Kind, uncertain: boolean) {
    this.creating.set(null);
    if (uncertain) {
      this.uncertainCreation.set(true);
      this.collectionGeneration.update((value) => value + 1);
      this.selected.set(null);
      this.tab.set(kind);
      this.state.error.set(
        'Consulte a lista antes de criar novamente: a resposta anterior não confirmou o resultado.',
      );
    }
  }
}
@Component({
  selector: 'app-governance-repository',
  providers: [GovernanceScope],
  imports: [AppShell, RouterLink, GovernancePanel],
  template: `<app-shell
    ><section class="window">
      <header class="window-header">Governança</header>
      <div class="panel-body">
        <div class="section-heading">
          <div>
            <h1>{{ scope.context.selected()?.name || 'Governança do Workspace' }}</h1>
            <div class="breadcrumb">
              <a routerLink="/governanca">Trocar Workspace</a>
              @if (scope.context.selected()) {
                <a [routerLink]="['/workspaces', scope.id()]">Administrar Workspace</a>
              }
            </div>
          </div>
          <button
            class="btn"
            type="button"
            [disabled]="scope.state.busy() || !!scope.state.wait()"
            (click)="scope.refresh()"
          >
            Atualizar acesso
          </button>
        </div>
        @if (scope.context.notice()) {
          <p class="message info" role="status">{{ scope.context.notice() }}</p>
        }
        @if (scope.state.error()) {
          <p class="message error" role="alert">
            {{ scope.state.error() }}
            @if (scope.state.wait()) {
              Aguarde {{ scope.state.wait() }}s.
            }
          </p>
        }
        @if (scope.state.busy()) {
          <p role="status">Carregando acesso ao Workspace…</p>
        }
        @if (scope.context.selected(); as w) {
          @if (available(w)) {
            @for (nav of [navigation()]; track nav.key) {
              <app-governance-panel [workspace]="w" [navigation]="nav" />
            }
          } @else {
            <p class="message info">
              Sua conta não possui permissão para acessar Governança neste Workspace.
            </p>
          }
        }
      </div>
    </section></app-shell
  >`,
})
export class GovernanceRepository {
  readonly scope = inject(GovernanceScope);
  private readonly route = inject(ActivatedRoute);
  readonly navigation = toSignal(
    (
      this.route.queryParamMap ?? of(this.route.snapshot.queryParamMap ?? convertToParamMap({}))
    ).pipe(
      map((params) => {
        const data = {
          frameworkId: params.get('frameworkId') ?? '',
          assessmentId: params.get('assessmentId') ?? '',
          goalId: params.get('goalId') ?? '',
        };
        return { ...data, key: JSON.stringify(data) };
      }),
    ),
    { initialValue: { frameworkId: '', assessmentId: '', goalId: '', key: '' } },
  );
  available(w: Workspace) {
    return ['governance.read', 'governance.assess', 'governance.manage'].some((p) =>
      w.permissions?.includes(p),
    );
  }
}
