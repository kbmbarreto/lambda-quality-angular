import { Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { Project } from '../features/projects/project.models';

@Injectable({ providedIn: 'root' })
export class ProjectContext {
  readonly selected = signal<Project | null>(null);
  readonly accessChanged = new Subject<{ workspaceId: string; projectId?: string }>();
  readonly notice = signal('');
  clear(): void {
    this.selected.set(null);
    this.notice.set('');
  }
}
