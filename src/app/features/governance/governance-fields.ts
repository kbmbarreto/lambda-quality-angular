import { FormGroup } from '@angular/forms';
import { EditorField } from '../workspaces/ui/form-dialog';
import { Member } from '../workspaces/workspace.models';
import { Project, validCalendarDate } from '../projects/project.models';
import { options } from '../test-cases/test-case.models';
import { uuidV4Pattern } from '../../shared/resource-id';
import {
  Framework,
  Goal,
  Action,
  Kind,
  RecordItem,
  Bodies,
  Metrics,
  goalTypes,
  operators,
  GoalType,
  Section,
  sectionPath,
} from './governance.models';
function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export interface Catalogs {
  frameworks: Framework[];
  projects: Project[];
  members: Member[];
  goals: Goal[];
  metrics: Metrics;
  sections?: Section[];
}
export const emptyCatalogs: Catalogs = {
  frameworks: [],
  projects: [],
  members: [],
  goals: [],
  metrics: { goalTypes: Object.keys(goalTypes) as GoalType[], indicatorType: 'INTERNAL' },
};
export const textField = (
  key: string,
  label: string,
  max: number,
  value = '',
  required = false,
): EditorField => ({ key, label, max, value, required });
export const descriptionField = (value: string | null = null): EditorField => ({
  key: 'description',
  label: 'Descrição',
  type: 'textarea',
  max: 10000,
  value: value ?? '',
});
export const codeField = (value = ''): EditorField => ({
  ...textField('code', 'Código', 50, value, true),
  pattern: /^[A-Z0-9_.-]{1,50}$/,
  hint: 'Letras maiúsculas ASCII, números, ponto, traço e sublinhado.',
});
export const uuidField = (
  key: string,
  label: string,
  value: string | null = null,
): EditorField => ({ ...textField(key, label, 36, value ?? ''), pattern: uuidV4Pattern });
export const dateField = (
  key: string,
  label: string,
  value: string | null = null,
  required = false,
): EditorField => ({ key, label, type: 'date', value: value ?? '', required });
function selector(
  key: string,
  label: string,
  rows: { id: string; label: string }[],
  current: string | null = null,
  required = false,
  empty = 'Nenhum',
): EditorField {
  return rows.length
    ? {
        key,
        label,
        type: 'select',
        value: current ?? '',
        required,
        options: [
          { value: '', label: empty },
          ...rows.map((r) => ({ value: r.id, label: r.label })),
          ...(current && !rows.some((r) => r.id === current)
            ? [{ value: current, label: `Vínculo atual · ${current}` }]
            : []),
        ],
      }
    : {
        ...uuidField(key, label, current),
        required,
        hint: required
          ? 'Informe o ID disponível neste Workspace.'
          : 'Deixe vazio para nenhum vínculo, ou informe o ID neste Workspace.',
      };
}
export function recordFields(
  kind: Kind,
  c: Catalogs,
  item?: RecordItem,
  links?: {
    frameworkId?: string;
    sectionId?: string;
    goalId?: string;
    controlAssessmentId?: string;
  },
): EditorField[] {
  if (kind === 'frameworks') {
    const f = item as Framework | undefined;
    return [
      codeField(f?.code),
      textField('name', 'Nome', 100, f?.name, true),
      textField('versionLabel', 'Versão da definição', 50, f?.versionLabel ?? '1.0', true),
      descriptionField(f?.description),
    ];
  }
  if (kind === 'assessments')
    return [
      selector(
        'frameworkId',
        'Framework ativo',
        c.frameworks
          .filter((f) => f.status === 'ACTIVE')
          .map((f) => ({ id: f.id, label: `${f.code} · ${f.name} (${f.versionLabel})` })),
        null,
        true,
        'Selecione',
      ),
      textField('name', 'Nome da avaliação', 100, '', true),
      dateField('assessmentDate', 'Data da avaliação', localToday(), true),
    ];
  if (kind === 'goals') {
    const g = item as Goal | undefined;
    return [
      textField('name', 'Nome', 100, g?.name, true),
      descriptionField(g?.description),
      {
        key: 'goalType',
        label: 'Métrica',
        type: 'select',
        value:
          g?.goalType ?? (links?.frameworkId ? 'GOVERNANCE_SCORE' : c.metrics.goalTypes[0]) ?? '',
        required: true,
        options: c.metrics.goalTypes.map((value) => ({ value, label: goalTypes[value] })),
      },
      selector(
        'projectId',
        'Projeto (vazio = Workspace)',
        c.projects.map((p) => ({ id: p.id, label: `${p.key} · ${p.name}` })),
        g?.projectId,
      ),
      selector(
        'frameworkId',
        'Framework para índice interno',
        c.frameworks.map((f) => ({ id: f.id, label: `${f.code} · ${f.name}` })),
        g?.frameworkId ?? links?.frameworkId,
      ),
      {
        key: 'sectionId',
        label: 'Seção da meta (vazio = framework inteiro)',
        type: 'select',
        value: g?.sectionId ?? links?.sectionId ?? '',
        options: [
          { value: '', label: 'Framework inteiro' },
          ...(c.sections ?? []).map((s) => ({
            value: s.id,
            label: sectionPath(s.id, c.sections ?? []),
          })),
          ...(g?.sectionId && !(c.sections ?? []).some((s) => s.id === g.sectionId)
            ? [{ value: g.sectionId, label: g.sectionName ?? 'Seção histórica vinculada' }]
            : []),
        ],
      },
      selector(
        'ownerMemberId',
        'Responsável',
        c.members.map((m) => ({ id: m.id, label: m.user.displayName })),
        g?.ownerMemberId,
      ),
      {
        key: 'operator',
        label: 'Comparação',
        type: 'select',
        required: true,
        value: g?.operator ?? 'GTE',
        options: options(operators),
      },
      {
        key: 'targetValue',
        label: 'Valor da meta',
        type: 'number',
        required: true,
        min: 0,
        max: 1000000000,
        integer: false,
        step: 0.01,
        value: g?.targetValue ?? (links?.frameworkId ? 100 : 0),
        hint: 'Percentuais: 0–100, até duas casas decimais. Defeitos: contagem inteira.',
      },
      dateField('deadline', 'Prazo', g?.deadline),
    ];
  }
  const a = item as Action | undefined;
  return [
    textField('title', 'Título', 250, a?.title, true),
    descriptionField(a?.description),
    selector(
      'ownerMemberId',
      'Responsável ativo',
      c.members.map((m) => ({ id: m.id, label: m.user.displayName })),
      a?.ownerMemberId,
    ),
    dateField('dueDate', 'Prazo', a?.dueDate),
    ...(!item
      ? [
          selector(
            'goalId',
            'Meta vinculada',
            c.goals.map((g) => ({ id: g.id, label: g.name })),
            links?.goalId ?? null,
          ),
          uuidField(
            'controlAssessmentId',
            'ID do controle avaliado (opcional)',
            links?.controlAssessmentId ?? null,
          ),
        ]
      : []),
  ];
}
export function fieldFailure(form: FormGroup, key: string, message: string) {
  const control = form.get(key);
  control?.setErrors({ server: message });
  control?.markAsTouched();
  return false;
}
export function validateDates(
  form: FormGroup,
  v: Record<string, unknown>,
  keys: string[],
): boolean {
  for (const key of keys) {
    const value = String(v[key] ?? '');
    if (value && !validCalendarDate(value))
      return fieldFailure(form, key, 'Informe uma data real entre 1000 e 9999.');
  }
  return true;
}
export function recordBody(
  kind: Kind,
  v: Record<string, unknown>,
  form: FormGroup,
  c: Catalogs,
): Bodies[Kind] | null {
  const text = (k: string) => String(v[k] ?? '').trim(),
    nullable = (k: string) => (v[k] === '' || v[k] == null ? null : String(v[k]));
  if (!validateDates(form, v, ['assessmentDate', 'deadline', 'dueDate'])) return null;
  if (kind === 'frameworks')
    return {
      code: text('code'),
      name: text('name'),
      versionLabel: text('versionLabel'),
      description: nullable('description'),
    };
  if (kind === 'assessments')
    return {
      frameworkId: text('frameworkId'),
      name: text('name'),
      assessmentDate: text('assessmentDate'),
    };
  if (kind === 'goals') {
    const type = text('goalType') as GoalType,
      target = v['targetValue'];
    if (!c.metrics.goalTypes.includes(type)) {
      fieldFailure(form, 'goalType', 'Selecione uma métrica disponível.');
      return null;
    }
    if (
      typeof target !== 'number' ||
      !Number.isFinite(target) ||
      target < 0 ||
      target > 1000000000 ||
      Math.abs(target * 100 - Math.round(target * 100)) > 1e-6 ||
      (type !== 'CRITICAL_DEFECTS' && target > 100) ||
      (type === 'CRITICAL_DEFECTS' && !Number.isInteger(target))
    ) {
      fieldFailure(form, 'targetValue', 'Informe um valor válido para a métrica escolhida.');
      return null;
    }
    if (
      type === 'GOVERNANCE_SCORE'
        ? !!nullable('projectId') || !nullable('frameworkId')
        : !!nullable('frameworkId')
    ) {
      fieldFailure(
        form,
        'frameworkId',
        'Índice interno exige framework e escopo Workspace. Outras métricas exigem framework vazio.',
      );
      return null;
    }
    if (nullable('sectionId') && type !== 'GOVERNANCE_SCORE') {
      fieldFailure(form, 'sectionId', 'A seção exige uma meta de índice interno de governança.');
      return null;
    }
    const section = c.sections?.find((s) => s.id === nullable('sectionId'));
    if (section && section.frameworkId !== nullable('frameworkId')) {
      fieldFailure(form, 'sectionId', 'Selecione uma seção do framework escolhido.');
      return null;
    }
    return {
      name: text('name'),
      description: nullable('description'),
      projectId: nullable('projectId'),
      frameworkId: nullable('frameworkId'),
      ...('sectionId' in v ? { sectionId: nullable('sectionId') } : {}),
      ...('ownerMemberId' in v ? { ownerMemberId: nullable('ownerMemberId') } : {}),
      goalType: type,
      operator: text('operator') as Goal['operator'],
      targetValue: target,
      deadline: nullable('deadline'),
    };
  }
  return {
    title: text('title'),
    description: nullable('description'),
    ownerMemberId: nullable('ownerMemberId'),
    dueDate: nullable('dueDate'),
    ...('goalId' in v
      ? { goalId: nullable('goalId'), controlAssessmentId: nullable('controlAssessmentId') }
      : {}),
  };
}
