import { EditorField } from '../workspaces/ui/form-dialog';
import { caseOptions, options } from '../test-cases/test-case.models';
import { DefectFields, DefectStatus, defectStatuses } from './defect.models';
export function defectFields(value?: DefectFields & { status?: DefectStatus }): EditorField[] {
  return [
    { key: 'title', label: 'Título', required: true, max: 250, value: value?.title ?? '' },
    {
      key: 'description',
      label: 'Descrição',
      type: 'textarea',
      max: 10000,
      value: value?.description ?? '',
    },
    {
      key: 'severity',
      label: 'Severidade',
      type: 'select',
      required: true,
      value: value?.severity ?? 'NORMAL',
      options: options(caseOptions.severity),
    },
    ...(value?.status
      ? [
          {
            key: 'status',
            label: 'Situação',
            type: 'select' as const,
            required: true,
            value: value.status,
            options: options(defectStatuses),
          },
        ]
      : []),
  ];
}
