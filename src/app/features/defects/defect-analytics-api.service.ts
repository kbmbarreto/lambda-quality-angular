import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { catchError, throwError, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../core/api.models';
import { ProjectContext } from '../../core/project-context.service';
import { DefectAnalytics, DefectAnalyticsQuery } from './defect-analytics.models';
@Injectable({ providedIn: 'root' })
export class DefectAnalyticsApi {
  private readonly http = inject(HttpClient);
  private readonly context = inject(ProjectContext);
  analytics(workspaceId: string, query: DefectAnalyticsQuery) {
    let params = new HttpParams().set('from', query.from).set('to', query.to);
    if (query.projectId) params = params.set('projectId', query.projectId);
    if (query.category) params = params.set('category', query.category);
    return this.http
      .get<ApiResponse<DefectAnalytics>>(
        `${environment.apiUrl}/workspaces/${encodeURIComponent(workspaceId)}/defects/analytics`,
        { params },
      )
      .pipe(
        timeout(20000),
        catchError((error) => {
          if (error instanceof HttpErrorResponse && [403, 404].includes(error.status)) {
            this.context.notice.set(
              'O acesso aos indicadores mudou. As permissões serão atualizadas.',
            );
            this.context.accessChanged.next({ workspaceId });
          }
          return throwError(() => error);
        }),
      );
  }
}
