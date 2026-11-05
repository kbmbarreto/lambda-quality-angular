import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';

export type AppTheme = 'LAMBDA' | 'LAMBDA_DARK' | 'CLASSIC';
export const themeNames: Record<AppTheme, string> = {
  LAMBDA: 'Padrão Lambda',
  LAMBDA_DARK: 'Lambda escuro',
  CLASSIC: 'Clássico',
};
export const preferencesCookie = 'lambda_quality_preferences';

export function storedTheme(doc: Document): AppTheme | null {
  try {
    const value = doc.cookie
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(preferencesCookie + '='))
      ?.slice(preferencesCookie.length + 1);
    return value === 'v1:LAMBDA'
      ? 'LAMBDA'
      : value === 'v1:LAMBDA_DARK'
        ? 'LAMBDA_DARK'
        : value === 'v1:CLASSIC'
          ? 'CLASSIC'
          : null;
  } catch {
    return null;
  }
}

export function applyTheme(doc: Document, theme: AppTheme): void {
  doc.documentElement.dataset['theme'] =
    theme === 'CLASSIC' ? 'classic' : theme === 'LAMBDA_DARK' ? 'lambda-dark' : 'lambda';
}

@Injectable({ providedIn: 'root' })
export class BrowserPreferences {
  private readonly doc = inject(DOCUMENT);
  readonly theme = signal<AppTheme>(storedTheme(this.doc) ?? 'LAMBDA');
  readonly storageError = signal('');

  constructor() {
    applyTheme(this.doc, this.theme());
  }

  hasConsent(): boolean {
    return storedTheme(this.doc) !== null;
  }

  restore(): void {
    this.theme.set(storedTheme(this.doc) ?? 'LAMBDA');
    applyTheme(this.doc, this.theme());
    this.storageError.set('');
  }

  accept(): boolean {
    return this.persist(this.theme());
  }

  selectTheme(theme: AppTheme): void {
    if (theme !== 'LAMBDA' && theme !== 'LAMBDA_DARK' && theme !== 'CLASSIC') return;
    this.theme.set(theme);
    applyTheme(this.doc, theme);
    if (this.hasConsent()) this.persist(theme);
    else
      this.storageError.set(
        'O tema vale para esta página. Para lembrá-lo, aceite o aviso de cookies no próximo acesso.',
      );
  }

  private persist(theme: AppTheme): boolean {
    this.storageError.set('');
    try {
      // First-party cookie; contains only acknowledgement version and theme, never credentials.
      this.doc.cookie = `${preferencesCookie}=v1:${theme}; Path=/; Max-Age=315360000; SameSite=Lax${this.doc.location.protocol === 'https:' ? '; Secure' : ''}`;
      if (storedTheme(this.doc) === theme) return true;
    } catch {
      /* A blocked cookie must not prevent access to the application. */
    }
    this.storageError.set(
      'O navegador não permitiu salvar o cookie. Você pode continuar; o aviso aparecerá novamente no próximo acesso.',
    );
    return false;
  }
}
