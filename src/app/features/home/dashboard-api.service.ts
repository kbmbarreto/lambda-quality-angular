import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { catchError, map, of, throwError, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../core/api.models';
import { DashboardOverview, DashboardPeriod } from './dashboard.models';

@Injectable({ providedIn: 'root' })
export class DashboardApi {
  private readonly http = inject(HttpClient);
  overview(days: DashboardPeriod, workspaceId = '') {
    let params = new HttpParams().set('days', days);
    if (workspaceId) params = params.set('workspaceId', workspaceId);
    return this.http
      .get<ApiResponse<DashboardOverview>>(`${environment.apiUrl}/dashboard/overview`, { params })
      .pipe(
        timeout(20000),
        map((r) => r.data),
        // The front can be deployed before the consolidated endpoint is delivered.
        catchError((error) =>
          error instanceof HttpErrorResponse && error.status === 404
            ? of(null)
            : throwError(() => error),
        ),
      );
  }
}
