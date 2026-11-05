import { Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { Workspace } from '../features/workspaces/workspace.models';

@Injectable({ providedIn: 'root' })
export class WorkspaceContext {
  readonly selected = signal<Workspace | null>(null);
  readonly accessChanged = new Subject<void>();
  readonly notice = signal('');

  clear(): void {
    this.selected.set(null);
    this.notice.set('');
  }

  can(permission: string): boolean {
    return !!this.selected()?.permissions?.includes(permission);
  }
}
