import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { DefectApi } from '../defects/defect-api.service';

@Injectable({ providedIn: 'root' })
export class OpenDefects {
  private readonly api = inject(DefectApi);
  count(workspaceId: string) {
    // The overview counts creations in a period. The inventory total counts current OPEN stock.
    return this.api.inventory({ page: 1, size: 1, status: 'OPEN', workspaceId }).pipe(
      map((response) => {
        const total = response.meta.pagination.totalItems;
        return Number.isSafeInteger(total) && total >= 0 ? total : null;
      }),
    );
  }
}
