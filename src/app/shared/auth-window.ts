import { Component, input } from '@angular/core';

@Component({
  selector: 'app-auth-window',
  template: `
    <main class="auth-page">
      <div class="login-wrapper">
        <div class="auth-brand">
          <img
            class="brand-logo"
            src="assets/logo_lambda_quality_transparent.png"
            alt="Lambda Quality"
            width="2172"
            height="724"
          />
        </div>
        <section class="window" aria-labelledby="window-title">
          <header class="window-header" id="window-title">{{ title() }}</header>
          <ng-content />
        </section>
        <div class="version">Lambda Quality — Versão 0.9.0</div>
        <div class="copyright">Lambda Team</div>
      </div>
    </main>
  `,
})
export class AuthWindow {
  readonly title = input('Lambda Quality');
}
