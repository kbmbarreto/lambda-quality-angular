import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { catchError, map, tap, throwError, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../core/api.models';
import { allPages } from '../test-cases/test-case.models';
import { DefectApi } from './defect-api.service';
import { DefectInventorySummary, DefectSummaryQuery, summarizeDefects } from './defect-summary';

@Injectable({ providedIn: 'root' })
export class DefectSummaryApi {
  private readonly http = inject(HttpClient);
  private readonly api = inject(DefectApi);
  private supported: boolean | undefined;
  get(query: DefectSummaryQuery) {
    const fallback = () =>
      allPages((page) =>
        this.api.inventory({ ...query, page, size: 100, sort: 'createdAt,desc' }),
      ).pipe(map(summarizeDefects));
    if (this.supported === false) return fallback();
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query))
      if (
        ['workspaceId', 'projectId', 'q', 'status', 'severity'].includes(key) &&
        value !== undefined &&
        value !== ''
      )
        params = params.set(key, String(value));
    return this.http
      .get<ApiResponse<DefectInventorySummary>>(`${environment.apiUrl}/defects/summary`, { params })
      .pipe(
        timeout(20000),
        map((response) => {
          this.supported = true;
          return response.data;
        }),
        catchError((error) => {
          // Compatibility with APIs that have only the paginated inventory.
          // A missing scope or lost access on an existing summary endpoint is an error.
          if (
            this.supported !== true &&
            error instanceof HttpErrorResponse &&
            error.status === 404
          ) {
            // The inventory validates exactly the same scope; a denied scope still fails.
            return fallback().pipe(
              tap(() => {
                this.supported = false;
              }),
            );
          }
          return throwError(() => error);
        }),
      );
  }
}
