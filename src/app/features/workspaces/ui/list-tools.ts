import { Component, OnInit, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ListQuery, Pagination } from '../workspace.models';

@Component({
  selector: 'app-list-tools',
  imports: [FormsModule],
  template: `
    <form class="list-toolbar" (ngSubmit)="submit($event)">
      @if (searchable()) {
        <label class="sr-only" for="search-{{ label() }}">Buscar {{ label() }}</label>
        <input
          id="search-{{ label() }}"
          [(ngModel)]="q"
          name="q"
          maxlength="100"
          [placeholder]="'Buscar ' + label()"
        />
      }
      @if (statuses().length) {
        <label class="sr-only" for="status-{{ label() }}">Situação de {{ label() }}</label
        ><select id="status-{{ label() }}" [(ngModel)]="status" name="status">
          <option value="">
            {{ emptyStatusLabel() || (defaultStatus() ? 'Padrão' : 'Todas as situações') }}
          </option>
          @for (item of statuses(); track item.value) {
            <option [value]="item.value">{{ item.label }}</option>
          }
        </select>
      }
      @if (sorts().length) {
        <label class="sr-only" for="sort-{{ label() }}">Ordenar {{ label() }}</label
        ><select id="sort-{{ label() }}" [(ngModel)]="sort" name="sort">
          @for (item of sorts(); track item.value) {
            <option [value]="item.value">{{ item.label }}</option>
          }
        </select>
      }
      <button class="btn" type="submit" [disabled]="busy()">Buscar</button>
      <button class="btn" type="button" (click)="refresh.emit()" [disabled]="busy()">
        Atualizar
      </button>
    </form>
  `,
})
export class ListTools implements OnInit {
  readonly label = input('itens');
  readonly busy = input(false);
  readonly searchable = input(true);
  readonly statuses = input<{ value: string; label: string }[]>([]);
  readonly defaultStatus = input('');
  readonly emptyStatusLabel = input('');
  readonly sorts = input<{ value: string; label: string }[]>([]);
  readonly search = output<ListQuery>();
  readonly refresh = output<void>();
  q = '';
  status = '';
  sort = '';
  submit(event: Event): void {
    event.stopPropagation();
    this.search.emit({
      q: this.q.trim(),
      status: this.status,
      sort: this.sort || this.sorts()[0]?.value,
    });
  }
  ngOnInit(): void {
    this.sort = this.sorts()[0]?.value ?? '';
    this.status = this.defaultStatus();
  }
}

@Component({
  selector: 'app-pagination',
  template: `@if (pagination(); as page) {
    <div class="pagination">
      <span
        >{{ page.totalItems }} registro(s) · Página {{ page.page }} de
        {{ page.totalPages || 1 }}</span
      ><button
        class="btn"
        type="button"
        [disabled]="busy() || !page.hasPrevious"
        (click)="change.emit(page.page - 1)"
      >
        Anterior</button
      ><button
        class="btn"
        type="button"
        [disabled]="busy() || !page.hasNext"
        (click)="change.emit(page.page + 1)"
      >
        Próxima
      </button>
    </div>
  }`,
})
export class PaginationControls {
  readonly pagination = input<Pagination | null>(null);
  readonly busy = input(false);
  readonly change = output<number>();
}
