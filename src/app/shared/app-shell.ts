import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { NoticeService } from '../core/notice.service';
import { BrowserPreferences } from '../core/browser-preferences';
import { NavIcon } from './nav-icon';
import { AcceptInvitation } from '../features/workspaces/accept-invitation';

@Component({
  selector: 'app-shell',
  imports: [RouterLink, RouterLinkActive, AcceptInvitation, NavIcon],
  template: `
    <div class="workspace" [class.menu-collapsed]="menuCollapsed()">
      <header class="app-header">
        <div class="app-brand">
          <img
            class="brand-logo"
            src="assets/logo_lambda_quality_transparent.png"
            alt="Lambda Quality"
            width="2172"
            height="724"
          />
          <span>Sistema de Gestão da Qualidade de Software</span>
        </div>
        <button
          class="btn menu-toggle"
          type="button"
          aria-controls="main-navigation"
          [attr.aria-expanded]="!menuCollapsed()"
          [attr.aria-label]="menuCollapsed() ? 'Expandir menu' : 'Recolher menu'"
          (click)="menuCollapsed.set(!menuCollapsed())"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        <div class="session-actions">
          <a class="header-profile-link" routerLink="/meu-perfil" title="Meu Perfil">
            <span class="profile-avatar" aria-hidden="true">{{ initials() }}</span>
            <span
              >{{ auth.user()?.displayName }}<small class="profile-caption">Meu Perfil</small></span
            > </a
          ><button
            class="btn header-invitation-button"
            type="button"
            title="Aceitar convite"
            aria-label="Aceitar convite"
            aria-haspopup="dialog"
            [attr.aria-expanded]="invitationOpen()"
            [disabled]="busy()"
            (click)="invitationOpen.set(true)"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="m3 6 9 7 9-7" />
            </svg>
          </button>
          <button class="btn" type="button" (click)="logout()" [disabled]="busy()">Sair</button>
        </div>
      </header>
      <div class="workspace-body">
        <nav id="main-navigation" class="window sidebar" aria-label="Navegação principal">
          <div class="window-header">Navegação</div>
          <a
            class="nav-item"
            routerLink="/inicio"
            routerLinkActive="active"
            ariaCurrentWhenActive="page"
            ><app-nav-icon name="home" /><span class="nav-label">Início</span></a
          >
          <a
            class="nav-item"
            routerLink="/meu-perfil"
            routerLinkActive="active"
            ariaCurrentWhenActive="page"
            ><app-nav-icon name="profile" /><span class="nav-label">Meu Perfil</span></a
          >
          <div class="sidebar-label">Gestão da qualidade</div>
          <a
            class="nav-item"
            routerLink="/workspaces"
            [class.active]="isWorkspaceSection()"
            [attr.aria-current]="isWorkspaceSection() ? 'page' : null"
            ><app-nav-icon name="workspace" /><span class="nav-label">Workspaces</span></a
          >
          <a
            class="nav-item"
            routerLink="/projetos"
            [class.active]="isProjectSection()"
            [attr.aria-current]="isProjectSection() ? 'page' : null"
            ><app-nav-icon name="project" /><span class="nav-label">Projetos</span></a
          >
          <a
            class="nav-item"
            routerLink="/ambientes"
            [class.active]="isEnvironmentSection()"
            [attr.aria-current]="isEnvironmentSection() ? 'page' : null"
            ><app-nav-icon name="environment" /><span class="nav-label">Ambientes</span></a
          >
          <a
            class="nav-item"
            routerLink="/casos-de-teste"
            [class.active]="isTestCaseSection()"
            [attr.aria-current]="isTestCaseSection() ? 'page' : null"
            ><app-nav-icon name="cases" /><span class="nav-label">Casos de teste</span></a
          >
          <a
            class="nav-item"
            routerLink="/planos-e-execucoes"
            [class.active]="isExecutionSection()"
            [attr.aria-current]="isExecutionSection() ? 'page' : null"
            ><app-nav-icon name="execution" /><span class="nav-label">Planos e execuções</span></a
          >
          <a
            class="nav-item"
            routerLink="/defeitos"
            [class.active]="isDefectSection()"
            [attr.aria-current]="isDefectSection() ? 'page' : null"
            ><app-nav-icon name="defects" /><span class="nav-label">Defeitos</span></a
          >
          <a
            class="nav-item"
            routerLink="/governanca"
            [class.active]="isGovernanceSection()"
            [attr.aria-current]="isGovernanceSection() ? 'page' : null"
            ><app-nav-icon name="governance" /><span class="nav-label">Governança</span></a
          >
        </nav>
        <main class="main-content"><ng-content /></main>
      </div>
      <footer class="app-footer">Lambda Quality — Versão 0.9.0 <span>Lambda Team</span></footer>
      @if (invitationOpen()) {
        <app-accept-invitation [modal]="true" (closed)="invitationOpen.set(false)" />
      }
    </div>
  `,
})
export class AppShell {
  readonly preferences = inject(BrowserPreferences);
  readonly menuCollapsed = signal(false);
  readonly auth = inject(AuthService);
  initials(): string {
    return (this.auth.user()?.displayName ?? '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0])
      .join('')
      .toUpperCase();
  }
  private readonly router = inject(Router);
  private readonly notice = inject(NoticeService);
  readonly busy = signal(false);
  readonly invitationOpen = signal(false);
  isProjectSection(): boolean {
    return (
      this.router.url.startsWith('/projetos') ||
      (/^\/workspaces\/[^/]+\/projects(?:[/?#]|$)/.test(this.router.url) &&
        !this.isTestCaseSection() &&
        !this.isExecutionSection() &&
        !this.isDefectSection() &&
        !this.isEnvironmentSection())
    );
  }
  isWorkspaceSection(): boolean {
    return (
      this.router.url.startsWith('/workspaces') &&
      !this.isProjectSection() &&
      !this.isTestCaseSection() &&
      !this.isExecutionSection() &&
      !this.isDefectSection() &&
      !this.isGovernanceSection() &&
      !this.isEnvironmentSection()
    );
  }
  isTestCaseSection(): boolean {
    return (
      this.router.url.startsWith('/casos-de-teste') ||
      /^\/workspaces\/[^/]+\/(?:projects\/[^/]+\/)?test-cases(?:[/?#]|$)/.test(this.router.url)
    );
  }
  isEnvironmentSection() {
    return (
      this.router.url.startsWith('/ambientes') ||
      /^\/workspaces\/[^/]+\/(?:projects\/[^/]+\/)?environments(?:[/?#]|$)/.test(this.router.url)
    );
  }
  isExecutionSection(): boolean {
    return (
      this.router.url.startsWith('/planos-e-execucoes') ||
      /^\/workspaces\/[^/]+\/(?:projects\/[^/]+\/)?execution(?:[/?#]|$)/.test(this.router.url)
    );
  }
  isDefectSection(): boolean {
    return (
      this.router.url.startsWith('/defeitos') ||
      /^\/workspaces\/[^/]+\/(?:projects\/[^/]+\/)?defects(?:[/?#]|$)/.test(this.router.url)
    );
  }
  isGovernanceSection(): boolean {
    return (
      this.router.url.startsWith('/governanca') ||
      /^\/workspaces\/[^/]+\/governance(?:[/?#]|$)/.test(this.router.url)
    );
  }
  logout(): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.auth
      .logout()
      .pipe(finalize(() => this.busy.set(false)))
      .subscribe({
        next: () => {
          this.notice.message.set('Sessão encerrada com sucesso.');
          void this.router.navigate(['/login']);
        },
        error: () => {
          this.notice.message.set(
            'Sessão encerrada neste navegador. Não foi possível confirmar a revogação no servidor.',
          );
          void this.router.navigate(['/login']);
        },
      });
  }
}
