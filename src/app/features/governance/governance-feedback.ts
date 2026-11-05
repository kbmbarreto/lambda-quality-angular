import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { TimeoutError } from 'rxjs';
import { problemOf } from '../../core/api-error';
import { OperationState } from '../workspaces/workspace-feedback';
export class GovernanceState extends OperationState {
  readonly blocked = signal(false);
  override fail(error: unknown, form?: FormGroup) {
    super.fail(error, form);
    if (
      problemOf(error).code === 'GOVERNANCE_VERSION_CONFLICT' ||
      error instanceof TimeoutError ||
      (error instanceof HttpErrorResponse && (error.status === 0 || error.status >= 500))
    )
      this.blocked.set(true);
  }
}
