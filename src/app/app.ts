import { Component, inject } from '@angular/core';
import { NavigationEnd, NavigationStart, Router, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { InvitationContext } from './core/invitation-context.service';
@Component({ selector: 'app-root', imports: [RouterOutlet], templateUrl: './app.html' })
export class App {
  private readonly invitation = inject(InvitationContext);
  private readonly router = inject(Router);
  constructor() {
    const capture = (url: string) => {
      const fragment = url.split('#')[1];
      if (fragment) this.invitation.capture(fragment);
    };
    capture(window.location.href);
    if (new URLSearchParams(window.location.hash.slice(1)).has('token')) {
      window.history.replaceState(
        window.history.state,
        '',
        window.location.pathname + window.location.search,
      );
    }
    this.router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event instanceof NavigationStart) capture(event.url);
      if (
        event instanceof NavigationEnd &&
        new URLSearchParams(event.urlAfterRedirects.split('#')[1] ?? '').has('token')
      ) {
        void this.router.navigateByUrl(event.urlAfterRedirects.split('#')[0], { replaceUrl: true });
      }
    });
  }
}
