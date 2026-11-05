import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { catchError, of, throwError, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import { allPages } from '../test-cases/test-case.models';
import { Page } from '../workspaces/workspace.models';
import { DefectStatus } from './defect.models';

export interface DefectHistoryEntry {
  id: string;
  type: 'CREATED' | 'UPDATED';
  actor: { id: string; displayName: string | null };
  createdAt: string;
  fromStatus: DefectStatus | null;
  toStatus: DefectStatus | null;
  comment: string | null;
}

@Injectable({ providedIn: 'root' })
export class DefectHistoryApi {
  private readonly http = inject(HttpClient);
  // Additive contract proposed in docs/API_DEFECT_ACTIVITY.md. The current API has no history route.
  load(w: string, p: string, id: string) {
    const url = `${environment.apiUrl}/workspaces/${encodeURIComponent(w)}/projects/${encodeURIComponent(p)}/defects/${encodeURIComponent(id)}/history`;
    return allPages((page) =>
      this.http
        .get<Page<DefectHistoryEntry>>(url, {
          params: { page, size: 100, sort: 'createdAt,asc' },
        })
        .pipe(timeout(20000)),
    ).pipe(
      catchError((error: unknown) =>
        error instanceof HttpErrorResponse && [404, 501].includes(error.status)
          ? of(null)
          : throwError(() => error),
      ),
    );
  }
}
