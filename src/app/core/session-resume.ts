import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { Tokens } from './api.models';

export const sessionResumeKey = 'lambda_quality_session:v1';
interface SavedSession {
  refreshToken: string;
  expiresAt: number;
}

@Injectable({ providedIn: 'root' })
export class SessionResume {
  private readonly doc = inject(DOCUMENT);
  save(tokens: Tokens): void {
    try {
      const expiresAt = Date.now() + tokens.refreshExpiresIn * 1000;
      if (!tokens.refreshToken || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
        this.clear();
        return;
      }
      this.doc.defaultView?.sessionStorage.setItem(
        sessionResumeKey,
        JSON.stringify({
          refreshToken: tokens.refreshToken,
          expiresAt,
        } satisfies SavedSession),
      );
    } catch {
      /* Storage restrictions must not prevent a normal login. */
    }
  }
  take(): SavedSession | null {
    try {
      const storage = this.doc.defaultView?.sessionStorage;
      const raw = storage?.getItem(sessionResumeKey);
      if (!storage || !raw) return null;
      // Refresh tokens are single-use. F5 during a pending renewal must never replay one.
      storage.removeItem(sessionResumeKey);
      if (storage.getItem(sessionResumeKey) !== null) return null;
      const data: unknown = JSON.parse(raw);
      if (!data || typeof data !== 'object') return null;
      const saved = data as Partial<SavedSession>;
      return typeof saved.refreshToken === 'string' &&
        saved.refreshToken.length > 0 &&
        saved.refreshToken.length <= 4096 &&
        typeof saved.expiresAt === 'number' &&
        Number.isFinite(saved.expiresAt) &&
        saved.expiresAt > Date.now()
        ? (saved as SavedSession)
        : null;
    } catch {
      return null;
    }
  }
  clear(): void {
    try {
      this.doc.defaultView?.sessionStorage.removeItem(sessionResumeKey);
    } catch {
      /* The in-memory session is still cleared if storage is unavailable. */
    }
  }
}
