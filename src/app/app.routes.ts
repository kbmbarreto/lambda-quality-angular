import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth.guard';
export const routes: Routes = [
  {
    path: 'login',
    title: 'Entrar · Lambda Quality',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login').then((m) => m.Login),
  },
  {
    path: 'cadastro',
    title: 'Criar conta · Lambda Quality',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/email-flow').then((m) => m.EmailFlow),
    data: { purpose: 'registration' },
  },
  {
    path: 'recuperar-senha',
    title: 'Recuperar senha · Lambda Quality',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/email-flow').then((m) => m.EmailFlow),
    data: { purpose: 'password-reset' },
  },
  {
    path: 'inicio',
    title: 'Início · Lambda Quality',
    canActivate: [authGuard],
    loadComponent: () => import('./features/home/home').then((m) => m.Home),
  },
  {
    path: 'meu-perfil',
    title: 'Meu Perfil · Lambda Quality',
    canActivate: [authGuard],
    loadComponent: () => import('./features/home/profile').then((m) => m.Profile),
  },
  {
    path: 'workspaces',
    title: 'Workspaces · Lambda Quality',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/workspaces/workspace-list').then((m) => m.WorkspaceList),
  },
  {
    path: 'workspaces/:workspaceId',
    title: 'Workspace · Lambda Quality',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/workspaces/workspace-detail').then((m) => m.WorkspaceDetail),
  },
  {
    path: 'projetos',
    title: 'Projetos · Lambda Quality',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/projects/project-workspaces').then((m) => m.ProjectWorkspaces),
  },
  {
    path: 'workspaces/:workspaceId/projects',
    title: 'Projetos · Lambda Quality',
    canActivate: [authGuard],
    loadComponent: () => import('./features/projects/project-list').then((m) => m.ProjectList),
  },
  {
    path: 'workspaces/:workspaceId/projects/:projectId',
    title: 'Projeto · Lambda Quality',
    canActivate: [authGuard],
    loadComponent: () => import('./features/projects/project-detail').then((m) => m.ProjectDetail),
  },
  {
    path: 'workspaces/:workspaceId/projects/:projectId/test-vault',
    title: 'Cofre de testes · Lambda Quality',
    canActivate: [authGuard],
    loadComponent: () => import('./features/test-vault/test-vault').then((m) => m.TestVault),
  },
  {
    path: 'casos-de-teste',
    title: 'Casos de teste · Lambda Quality',
    canActivate: [authGuard],
    data: { testCases: true },
    loadComponent: () =>
      import('./features/test-cases/test-repository-entry').then((m) => m.TestRepositoryEntry),
  },
  {
    path: 'ambientes',
    title: 'Ambientes · Lambda Quality',
    canActivate: [authGuard],
    data: { environments: true },
    loadComponent: () =>
      import('./features/projects/project-workspaces').then((m) => m.ProjectWorkspaces),
  },
  {
    path: 'workspaces/:workspaceId/environments',
    title: 'Selecionar projeto · Ambientes',
    canActivate: [authGuard],
    data: { environments: true },
    loadComponent: () => import('./features/projects/project-list').then((m) => m.ProjectList),
  },
  {
    path: 'workspaces/:workspaceId/projects/:projectId/environments',
    title: 'Ambientes · Lambda Quality',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/projects/environment-repository').then((m) => m.EnvironmentRepository),
  },
  {
    path: 'workspaces/:workspaceId/test-cases',
    title: 'Selecionar projeto · Casos de teste',
    canActivate: [authGuard],
    data: { testCases: true },
    loadComponent: () =>
      import('./features/test-cases/test-repository-entry').then((m) => m.TestRepositoryEntry),
  },
  {
    path: 'workspaces/:workspaceId/projects/:projectId/test-cases',
    title: 'Casos de teste · Lambda Quality',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/test-cases/test-repository').then((m) => m.TestRepository),
  },
  {
    path: 'execucoes',
    title: 'Todas as execuções · Lambda Quality',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/execution/execution-inventory').then((m) => m.ExecutionInventory),
  },
  {
    path: 'planos-e-execucoes',
    title: 'Planos e execuções · Lambda Quality',
    canActivate: [authGuard],
    data: { execution: true },
    loadComponent: () =>
      import('./features/projects/project-workspaces').then((m) => m.ProjectWorkspaces),
  },
  {
    path: 'workspaces/:workspaceId/execution',
    title: 'Selecionar projeto · Planos e execuções',
    canActivate: [authGuard],
    data: { execution: true },
    loadComponent: () => import('./features/projects/project-list').then((m) => m.ProjectList),
  },
  {
    path: 'workspaces/:workspaceId/projects/:projectId/execution',
    title: 'Planos e execuções · Lambda Quality',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/execution/execution-repository').then((m) => m.ExecutionRepository),
  },
  {
    path: 'defeitos',
    title: 'Defeitos · Lambda Quality',
    canActivate: [authGuard],
    data: { defects: true },
    loadComponent: () =>
      import('./features/projects/project-workspaces').then((m) => m.ProjectWorkspaces),
  },
  {
    path: 'workspaces/:workspaceId/defects',
    title: 'Selecionar projeto · Defeitos',
    canActivate: [authGuard],
    data: { defects: true },
    loadComponent: () => import('./features/projects/project-list').then((m) => m.ProjectList),
  },
  {
    path: 'workspaces/:workspaceId/defects/analytics',
    title: 'Indicadores de bugs · Lambda Quality',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/defects/defect-analytics').then((m) => m.DefectAnalyticsRepository),
  },
  {
    path: 'workspaces/:workspaceId/projects/:projectId/defects',
    title: 'Defeitos · Lambda Quality',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/defects/defect-repository').then((m) => m.DefectRepository),
  },
  {
    path: 'governanca',
    title: 'Governança · Lambda Quality',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/governance/governance-workspaces').then((m) => m.GovernanceWorkspaces),
  },
  {
    path: 'workspaces/:workspaceId/governance',
    title: 'Governança · Lambda Quality',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/governance/governance-repository').then((m) => m.GovernanceRepository),
  },
  {
    path: 'convites/aceitar',
    title: 'Aceitar convite · Lambda Quality',
    loadComponent: () =>
      import('./features/workspaces/accept-invitation').then((m) => m.AcceptInvitation),
  },
  { path: '', pathMatch: 'full', redirectTo: 'inicio' },
  { path: '**', redirectTo: 'inicio' },
];
