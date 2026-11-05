import { Injectable, inject } from '@angular/core';
import { of } from 'rxjs';
import { FormGroup } from '@angular/forms';
import { ProjectApi } from '../projects/project-api.service';
import { Project, ProjectEnvironment, environmentCategories } from '../projects/project.models';
import { allPages } from '../test-cases/test-case.models';
import { EditorField } from '../workspaces/ui/form-dialog';
import { validResourceId } from '../../shared/resource-id';
import { Defect } from './defect.models';
export const inheritEnvironment = '__INHERIT__';
export const keepEnvironment = '__KEEP__';

@Injectable({ providedIn: 'root' })
export class DefectEnvironments {
  private readonly api = inject(ProjectApi);
  load(project: Project) {
    return project.permissions.includes('project.read')
      ? allPages((page) =>
          this.api.resources(project.workspaceId, project.id, 'environments', {
            page,
            size: 100,
            sort: 'name,asc',
          }),
        )
      : of([]);
  }
}
export function environmentField(
  rows: ProjectEnvironment[],
  failure = false,
  existing?: Defect,
): EditorField {
  return {
    key: 'environmentId',
    label: 'Ambiente',
    type: 'select',
    value: existing ? keepEnvironment : failure ? inheritEnvironment : '',
    options: [
      ...(existing
        ? [
            {
              value: keepEnvironment,
              label: `Manter atual: ${existing.environmentSnapshot?.name ?? 'Sem ambiente'}`,
            },
          ]
        : []),
      ...(failure ? [{ value: inheritEnvironment, label: 'Herdar ambiente da execução' }] : []),
      { value: '', label: 'Sem ambiente' },
      ...rows
        .filter((row) => row.active && !row.deletedAt)
        .map((row) => ({
          value: row.id,
          label: `${row.name} · ${environmentCategories[row.category ?? 'OTHER']}`,
        })),
    ],
    hint: existing
      ? 'Manter atual preserva o nome e a categoria históricos. Escolher um ambiente copia o cadastro atual.'
      : failure
        ? 'Herdar preserva o ambiente da execução, mesmo que hoje esteja inativo. Sem ambiente remove essa herança.'
        : 'Selecione o ambiente do projeto ou declare Sem ambiente.',
  };
}
export function environmentBody(
  values: Record<string, unknown>,
  form: FormGroup,
): { environmentId?: string | null } | null {
  if (
    !('environmentId' in values) ||
    [inheritEnvironment, keepEnvironment].includes(String(values['environmentId']))
  )
    return {};
  const value = String(values['environmentId'] ?? '');
  if (value && !validResourceId(value)) {
    form.get('environmentId')?.setErrors({ server: 'Selecione um ambiente válido.' });
    return null;
  }
  return { environmentId: value || null };
}
