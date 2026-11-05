import { Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AppShell } from '../../shared/app-shell';
import { projectSectionRoot } from './project-section';
import { ProjectScope } from './project-scope';

@Component({
  selector: 'app-project-frame',
  imports: [AppShell, RouterLink],
  template: `
    <app-shell
      ><section class="window">
        <header class="window-header">{{ title() }}</header>
        <div class="panel-body">
          <div class="section-heading">
            <div>
              <div class="eyebrow">{{ scope.workspace.selected()?.name || 'Workspace' }}</div>
              <h1>
                {{
                  scope.context.selected()?.name ||
                    heading() ||
                    (scope.projectId() ? 'Projeto' : 'Projetos')
                }}
              </h1>
              <div class="breadcrumb">
                <a [routerLink]="sectionRoot(title())">Trocar Workspace</a>
                @if (scope.workspace.selected()) {
                  <a [routerLink]="['/workspaces', scope.workspaceId()]">Administrar Workspace</a>
                }
                @if (scope.projectId()) {
                  <a [routerLink]="['/workspaces', scope.workspaceId(), 'projects']"
                    >Todos os projetos</a
                  >
                }
              </div>
            </div>
            <button
              class="btn"
              type="button"
              (click)="scope.refresh()"
              [disabled]="scope.state.busy() || !!scope.state.wait()"
            >
              {{ scope.state.wait() ? 'Aguarde ' + scope.state.wait() + 's' : 'Atualizar acesso' }}
            </button>
          </div>
          @if (scope.context.notice()) {
            <p class="message info" role="status">{{ scope.context.notice() }}</p>
          }
          @if (scope.state.error()) {
            <p class="message error" role="alert">{{ scope.state.error() }}</p>
          }
          @if (scope.state.busy()) {
            <p role="status">Carregando acesso…</p>
          }
          @if (scope.workspace.selected() && (!scope.projectId() || scope.context.selected())) {
            <ng-content />
          }
        </div></section
    ></app-shell>
  `,
})
export class ProjectFrame {
  readonly title = input('Projetos');
  readonly heading = input('');
  readonly sectionRoot = projectSectionRoot;
  readonly scope = inject(ProjectScope);
}
