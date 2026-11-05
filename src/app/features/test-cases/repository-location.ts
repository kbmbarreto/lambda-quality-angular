import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from '../../core/auth.service';
import { Project } from '../projects/project.models';
export interface RepositoryLocation {
  workspaceId: string;
  projectId: string;
}
@Injectable({ providedIn: 'root' })
export class RepositoryHistory {
  private readonly auth = inject(AuthService);
  private readonly remembered = signal<{ userId: string; location: RepositoryLocation } | null>(
    null,
  );
  read(): RepositoryLocation | null {
    const userId = this.auth.user()?.id;
    if (!userId) return null;
    if (this.remembered()?.userId === userId) return this.remembered()!.location;
    try {
      const item = JSON.parse(
        sessionStorage.getItem(`lambdaquality.repository.${userId}`) ?? 'null',
      );
      const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
      return item && uuid.test(item.workspaceId) && uuid.test(item.projectId) ? item : null;
    } catch {
      return null;
    }
  }
  remember(project: Project) {
    const userId = this.auth.user()?.id;
    if (!userId) return;
    const location = { workspaceId: project.workspaceId, projectId: project.id };
    this.remembered.set({ userId, location });
    try {
      sessionStorage.setItem(`lambdaquality.repository.${userId}`, JSON.stringify(location));
    } catch {
      /* Memory remains available if browser storage is blocked. */
    }
  }
  clear() {
    this.remembered.set(null);
    const userId = this.auth.user()?.id;
    if (userId)
      try {
        sessionStorage.removeItem(`lambdaquality.repository.${userId}`);
      } catch {
        /* Storage is optional. */
      }
  }
}
