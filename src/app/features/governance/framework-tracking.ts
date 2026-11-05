import {
  Component,
  DestroyRef,
  Injector,
  OnInit,
  inject,
  input,
  output,
  runInInjectionContext,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SaoPauloDatePipe as DatePipe } from '../../shared/sao-paulo-date.pipe';
import { forkJoin, map, of, switchMap } from 'rxjs';
import { allPages } from '../test-cases/test-case.models';
import { OperationState } from '../workspaces/workspace-feedback';
import { GovernanceApi } from './governance-api.service';
import { GovernanceSession } from './governance-session';
import { GovernanceConflict } from './governance-conflict';
import { AssessmentControls } from './assessment-controls';
import { Assessment, Framework, assessmentStatuses } from './governance.models';
import { FrameworkProgress } from './framework-progress.models';

@Component({
  selector: 'app-framework-assessment',
  imports: [DatePipe, GovernanceConflict, AssessmentControls],
  template: `@if (session.view().progress; as progress) {
      <p class="message info">
        {{ initial().name }} · {{ statuses[session.assessment().status] }} · Definição versão
        {{ progress.assessment?.definitionVersion }}
        @if (session.assessment().status !== 'CLOSED') {
          · Progresso provisório
        }
        @if (progress.definitionVersionDiffers) {
          <br />A definição atual mudou. Este acompanhamento preserva a estrutura da avaliação.
        }
      </p>
      @if (session.assessment().closedAt; as date) {
        <p class="dashboard-footnote">Encerrada em {{ date | date: 'dd/MM/yyyy HH:mm' }}</p>
      }
    }
    @if (session.read.busy() || session.state.busy()) {
      <p role="status">Atualizando acompanhamento…</p>
    }
    @if (session.read.error()) {
      <p class="message error" role="alert">{{ session.read.error() }}</p>
    }
    @if (session.state.error()) {
      <p class="message error" role="alert">{{ session.state.error() }}</p>
    }
    @if (session.state.success()) {
      <p class="message success" role="status">{{ session.state.success() }}</p>
    }
    <app-governance-conflict [session]="session" />
    <div class="row-actions">
      <button
        class="btn"
        type="button"
        [disabled]="
          session.read.busy() ||
          session.state.busy() ||
          !!session.read.wait() ||
          !!session.state.wait()
        "
        (click)="session.reload()"
      >
        Atualizar acompanhamento{{ session.read.wait() ? ' (' + session.read.wait() + 's)' : '' }}
      </button>
      <button
        class="btn"
        type="button"
        [disabled]="session.read.busy() || session.state.busy()"
        (click)="opened.emit(initial().id)"
      >
        {{
          session.assessment().status === 'DRAFT'
            ? 'Abrir avaliação para iniciar'
            : 'Consultar avaliação'
        }}
      </button>
    </div>
    <app-assessment-controls
      [session]="session"
      (goal)="goal.emit($event)"
      (action)="action.emit($event)"
    />`,
})
export class FrameworkAssessment implements OnInit {
  readonly initial = input.required<Assessment>();
  readonly opened = output<string>();
  readonly goal = output<string>();
  readonly action = output<string>();
  readonly changed = output<void>();
  private readonly injector = inject(Injector);
  readonly statuses = assessmentStatuses;
  session!: GovernanceSession;
  ngOnInit() {
    this.session = runInInjectionContext(
      this.injector,
      () => new GovernanceSession('assessments', this.initial(), () => this.changed.emit()),
    );
    this.session.reload();
  }
}
@Component({
  selector: 'app-framework-tracking',
  imports: [FormsModule, FrameworkAssessment],
  template: `<section aria-label="Acompanhamento do framework">
    <div class="section-heading">
      <h2>Acompanhamento</h2>
      @if (canCreate()) {
        <button class="btn" type="button" [disabled]="busy()" (click)="create.emit()">
          + Avaliação
        </button>
      }
    </div>
    <div class="case-filters">
      <label
        >Avaliação
        <select
          name="framework-assessment"
          [ngModel]="choice"
          [disabled]="busy()"
          (ngModelChange)="choose($event)"
        >
          <option value="">Atual: em andamento ou última encerrada</option>
          @for (a of assessments(); track a.id) {
            <option [value]="a.id">{{ a.name }} · {{ statuses[a.status] }}</option>
          }
        </select></label
      >
      <button class="btn" type="button" [disabled]="busy() || !!read.wait()" (click)="load()">
        Atualizar{{ read.wait() ? ' (' + read.wait() + 's)' : '' }}
      </button>
    </div>
    @if (read.busy()) {
      <p role="status">Consultando progresso…</p>
    }
    @if (read.error()) {
      <p class="message error" role="alert">{{ read.error() }}</p>
    }
    @if (progress()?.state === 'NO_ASSESSMENT' && !read.error()) {
      <p class="message info">
        Este framework ainda não tem uma avaliação em andamento ou encerrada. Selecione um rascunho
        ou crie uma avaliação para começar.
      </p>
    }
    @if (assessment(); as a) {
      @for (source of [a]; track source.id) {
        <app-framework-assessment
          [initial]="source"
          (opened)="opened.emit($event)"
          (goal)="goal.emit($event)"
          (action)="action.emit($event)"
          (changed)="changed.emit()"
        />
      }
    }
  </section>`,
})
export class FrameworkTracking implements OnInit {
  readonly framework = input.required<Framework>();
  readonly initialAssessmentId = input('');
  readonly canCreate = input(false);
  readonly create = output<void>();
  readonly opened = output<string>();
  readonly goal = output<string>();
  readonly action = output<string>();
  readonly changed = output<void>();
  readonly child = viewChild(FrameworkAssessment);
  private readonly api = inject(GovernanceApi);
  readonly read = new OperationState(inject(DestroyRef));
  readonly progress = signal<FrameworkProgress | null>(null);
  readonly assessment = signal<Assessment | null>(null);
  readonly assessments = signal<Assessment[]>([]);
  readonly statuses = assessmentStatuses;
  choice = '';
  ngOnInit() {
    this.choice = this.initialAssessmentId();
    this.load();
  }
  busy() {
    return (
      this.read.busy() ||
      !!this.child()?.session?.state.busy() ||
      !!this.child()?.session?.read.busy()
    );
  }
  choose(id: string) {
    if (this.busy()) return;
    this.choice = id;
    this.load();
  }
  load() {
    if (this.busy() || this.read.wait()) return;
    const f = this.framework();
    this.assessment.set(null);
    this.progress.set(null);
    this.read.run(
      forkJoin({
        progress: this.api
          .progress(f.workspaceId, f.id, this.choice || undefined)
          .pipe(map((r) => r.data)),
        assessments: allPages((page) =>
          this.api.list(f.workspaceId, 'assessments', {
            page,
            size: 100,
            sort: 'createdAt,desc',
            status: 'ALL',
            frameworkId: f.id,
          }),
        ),
      }).pipe(
        switchMap((result) =>
          result.progress.assessment
            ? this.api
                .get(f.workspaceId, 'assessments', result.progress.assessment.id)
                .pipe(map((r) => ({ ...result, assessment: r.data })))
            : of({ ...result, assessment: null }),
        ),
      ),
      (result) => {
        this.progress.set(result.progress);
        this.assessments.set(result.assessments);
        this.assessment.set(result.assessment);
      },
    );
  }
}
