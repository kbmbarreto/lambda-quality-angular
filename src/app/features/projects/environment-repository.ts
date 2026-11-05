import { Component, inject } from '@angular/core';
import { ProjectScope } from './project-scope';
import { ProjectFrame } from './project-frame';
import { ProjectResourcesPanel } from './project-resources';
@Component({
  selector: 'app-environment-repository',
  providers: [ProjectScope],
  imports: [ProjectFrame, ProjectResourcesPanel],
  template: `<app-project-frame title="Ambientes">
    @if (scope.context.selected(); as project) {
      @if (project.permissions.includes('project.read')) {
        <p class="dashboard-footnote">
          Ambientes deste projeto. A categoria identifica Produção, Homologação ou Outro. Alterações
          preservam os registros históricos dos defeitos e execuções.
        </p>
        @if (project.status === 'ARCHIVED') {
          <p class="message info">Projeto arquivado. Ambientes disponíveis para consulta.</p>
        }
        <app-project-resources [project]="project" kind="environments" />
      } @else {
        <p class="message info">
          Sua conta não possui permissão para consultar os ambientes deste projeto.
        </p>
      }
    }
  </app-project-frame>`,
})
export class EnvironmentRepository {
  readonly scope = inject(ProjectScope);
}
