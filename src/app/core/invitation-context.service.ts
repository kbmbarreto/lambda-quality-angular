import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class InvitationContext {
  // Intentionally survives navigation through login/registration, never persisted.
  readonly token = signal('');
  capture(fragment: string): void {
    const token = new URLSearchParams(fragment).get('token');
    if (token) this.token.set(token);
  }
  clear(): void {
    this.token.set('');
  }
}
