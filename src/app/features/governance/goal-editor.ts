import { of } from 'rxjs';
import { EditorChange, EditorField } from '../workspaces/ui/form-dialog';
import { OperationState } from '../workspaces/workspace-feedback';
import { GovernanceCatalogs } from './governance-catalogs.service';
import { Catalogs, recordFields } from './governance-fields';

// Rebuild dependent selectors with the complete draft so changing a framework
// does not discard the name, target, deadline or other unsaved fields.
export function changeGoalEditor(
  event: EditorChange,
  catalogs: Catalogs,
  api: GovernanceCatalogs,
  read: OperationState,
  workspaceId: string,
  update: (fields: EditorField[]) => void,
) {
  if (!['frameworkId', 'goalType'].includes(event.key) || read.busy() || read.wait()) return;
  const values = { ...event.values };
  values['sectionId'] = '';
  if (values['goalType'] === 'GOVERNANCE_SCORE') values['projectId'] = '';
  else values['frameworkId'] = '';
  const frameworkId = String(values['frameworkId'] ?? '');
  event.form.patchValue({
    sectionId: '',
    projectId: values['projectId'],
    frameworkId: values['frameworkId'],
  });
  read.run(frameworkId ? api.sections(workspaceId, frameworkId) : of([]), (sections) => {
    catalogs.sections = sections;
    update(
      recordFields('goals', catalogs).map((field) => ({
        ...field,
        value: values[field.key] ?? field.value,
        ...(field.key === 'sectionId'
          ? { disabled: values['goalType'] !== 'GOVERNANCE_SCORE' }
          : {}),
        ...(field.key === 'targetValue'
          ? { max: values['goalType'] === 'CRITICAL_DEFECTS' ? 1000000000 : 100 }
          : {}),
      })),
    );
  });
}
