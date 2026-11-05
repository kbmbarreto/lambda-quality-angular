import { Component, input } from '@angular/core';

const paths: Record<string, string> = {
  home: 'm3 10 9-7 9 7v10H3V10m6 10v-7h6v7',
  profile: 'M8 7a4 4 0 1 0 8 0 4 4 0 1 0-8 0M4 21v-3a8 8 0 0 1 16 0v3',
  workspace: 'M3 3h7v7H3V3m11 0h7v7h-7V3M3 14h7v7H3v-7m11 0h7v7h-7v-7',
  project: 'M3 7h18v14H3V7m5 0V3h8v4M3 12h18M10 10v4h4v-4',
  environment: 'M3 3h18v14H3V3m5 18h8m-4-4v4M6 7h6m-6 4h11',
  cases: 'M5 3h10l4 4v14H5V3m10 0v5h4M8 12h8m-8 4h5',
  execution: 'M5 3h14v18H5V3m4 5 7 4-7 4V8',
  defects: 'M8 8h8v9a4 4 0 0 1-8 0V8m2 0V5h4v3M3 11h5m8 0h5M3 17h5m8 0h5M5 4l3 4m8 0 3-4',
  governance: 'M12 3 3 7v6c0 4 4 7 9 9 5-2 9-5 9-9V7l-9-4m-4 9 3 3 5-6',
};
@Component({
  selector: 'app-nav-icon',
  template: `<svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
    <path [attr.d]="path()" />
  </svg>`,
})
export class NavIcon {
  readonly name = input.required<string>();
  path() {
    return paths[this.name()] ?? paths['workspace'];
  }
}
