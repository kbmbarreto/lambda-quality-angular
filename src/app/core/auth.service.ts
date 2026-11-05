import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import {
  Observable,
  catchError,
  finalize,
  map,
  shareReplay,
  switchMap,
  tap,
  throwError,
  timeout,
  of,
} from 'rxjs';
import { environment } from '../../environments/environment';
import { ApiResponse, EmailChallenge, Tokens, User } from './api.models';
import { WorkspaceContext } from './workspace-context.service';
import { InvitationContext } from './invitation-context.service';
import { ProjectContext } from './project-context.service';
import { SessionResume } from './session-resume';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly workspace = inject(WorkspaceContext);
  private readonly project = inject(ProjectContext);
  private readonly invitation = inject(InvitationContext);
  private readonly resume = inject(SessionResume);
  private readonly base = `${environment.apiUrl}/auth`;
  private tokens: Tokens | null = null;
  private renewal?: Observable<Tokens>;
  private restoration?: Observable<boolean>;
  private generation = 0;
  private readonly currentUser = signal<User | null>(null);
  readonly user = this.currentUser.asReadonly();

  get accessToken(): string | null {
    return this.tokens?.accessToken ?? null;
  }

  login(email: string, password: string): Observable<User> {
    this.clearSession();
    const generation = ++this.generation;
    return this.http
      .post<ApiResponse<Tokens>>(`${this.base}/login`, { email: email.trim(), password })
      .pipe(
        timeout(15000),
        tap(({ data }) => {
          if (generation !== this.generation) throw new Error('Session changed');
          this.tokens = data;
        }),
        switchMap(() => this.loadProfile()),
        tap(() => {
          if (generation === this.generation && this.tokens) this.resume.save(this.tokens);
        }),
        catchError((error) => {
          if (generation === this.generation) this.clearSession();
          return throwError(() => error);
        }),
      );
  }

  loadProfile(): Observable<User> {
    const generation = this.generation;
    return this.http.get<ApiResponse<User>>(`${this.base}/me`).pipe(
      timeout(15000),
      map((response) => response.data),
      tap((user) => {
        if (generation === this.generation && this.tokens) this.currentUser.set(user);
      }),
    );
  }

  refresh(): Observable<Tokens> {
    if (this.renewal) return this.renewal;
    if (!this.tokens) return throwError(() => new Error('No session'));
    return this.renew(this.tokens.refreshToken);
  }

  ensureSession(): Observable<boolean> {
    if (this.user()) return of(true);
    if (this.restoration) return this.restoration;
    const saved = this.resume.take();
    if (!saved) return of(false);
    const generation = this.generation;
    const operation = this.renew(saved.refreshToken).pipe(
      switchMap(() => this.loadProfile()),
      map(() => generation === this.generation && !!this.user()),
      catchError(() => {
        if (generation === this.generation) this.clearSession();
        return of(!!this.user());
      }),
      finalize(() => {
        if (this.restoration === operation) this.restoration = undefined;
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    this.restoration = operation;
    return operation;
  }

  private renew(refreshToken: string): Observable<Tokens> {
    if (this.renewal) return this.renewal;
    const generation = this.generation;
    this.resume.clear();
    const operation = this.http
      .post<ApiResponse<Tokens>>(`${this.base}/refresh`, { refreshToken })
      .pipe(
        timeout(15000),
        map((response) => response.data),
        tap((tokens) => {
          if (generation !== this.generation) throw new Error('Session changed');
          this.tokens = tokens;
          this.resume.save(tokens);
        }),
        catchError((error) => {
          if (generation === this.generation) this.clearSession();
          return throwError(() => error);
        }),
        finalize(() => {
          if (this.renewal === operation) this.renewal = undefined;
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    this.renewal = operation;
    return operation;
  }

  requestCode(
    purpose: 'registration' | 'password-reset',
    email: string,
  ): Observable<ApiResponse<EmailChallenge>> {
    return this.http
      .post<ApiResponse<EmailChallenge>>(`${this.base}/${purpose}/code`, { email: email.trim() })
      .pipe(timeout(15000));
  }

  register(body: {
    challengeId: string;
    code: string;
    displayName: string;
    password: string;
  }): Observable<ApiResponse<User>> {
    return this.http.post<ApiResponse<User>>(`${this.base}/register`, body).pipe(timeout(15000));
  }

  resetPassword(body: {
    challengeId: string;
    code: string;
    newPassword: string;
  }): Observable<void> {
    return this.http.post<void>(`${this.base}/password-reset`, body).pipe(
      timeout(15000),
      tap(() => this.clearSession()),
    );
  }

  logout(all = false): Observable<void> {
    this.resume.clear();
    return this.http.post<void>(`${this.base}/${all ? 'logout-all' : 'logout'}`, {}).pipe(
      timeout(15000),
      finalize(() => {
        this.clearSession();
        this.invitation.clear();
      }),
    );
  }

  clearSession(): void {
    this.generation++;
    this.tokens = null;
    this.renewal = undefined;
    this.restoration = undefined;
    this.resume.clear();
    this.currentUser.set(null);
    this.workspace.clear();
    this.project.clear();
  }
}
