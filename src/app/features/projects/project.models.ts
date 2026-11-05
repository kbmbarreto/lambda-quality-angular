import { Member } from '../workspaces/workspace.models';

export type ProjectRole = 'VIEWER' | 'EDITOR' | 'MANAGER';
export interface Project {
  id: string;
  workspaceId: string;
  key: string;
  name: string;
  description: string | null;
  status: 'ACTIVE' | 'ARCHIVED';
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  projectRole: ProjectRole | null;
  permissions: string[];
}
export interface ProjectMember {
  id: string;
  workspaceId: string;
  projectId: string;
  workspaceMemberId: string;
  projectRole: ProjectRole;
  createdAt: string;
  updatedAt: string;
}
export interface ProjectMemberDetails extends ProjectMember {
  workspaceMemberStatus: 'ACTIVE' | 'SUSPENDED';
  user: Member['user'];
}
export type MilestoneStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export interface Milestone {
  id: string;
  workspaceId: string;
  projectId: string;
  name: string;
  description: string | null;
  status: MilestoneStatus;
  startDate: string | null;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
export interface ProjectEnvironment {
  id: string;
  workspaceId: string;
  projectId: string;
  name: string;
  description: string | null;
  active: boolean;
  category?: EnvironmentCategory;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
export interface ProjectBody {
  name: string;
  description: string | null;
}
export interface MilestoneBody extends ProjectBody {
  startDate: string | null;
  dueDate: string | null;
}
export interface EnvironmentBody extends ProjectBody {
  active: boolean;
  category?: EnvironmentCategory;
}
export const environmentCategories = {
  PRODUCTION: 'Produção',
  HOMOLOGATION: 'Homologação',
  OTHER: 'Outro',
};
export type EnvironmentCategory = keyof typeof environmentCategories;
export interface ProjectResources {
  milestones: Milestone;
  environments: ProjectEnvironment;
}
export interface ProjectBodies {
  milestones: MilestoneBody;
  environments: EnvironmentBody;
}
export interface ProjectUpdates {
  milestones: MilestoneBody & { status: Exclude<MilestoneStatus, 'COMPLETED'> };
  environments: EnvironmentBody;
}
export const projectRoleLabels: Record<ProjectRole, string> = {
  VIEWER: 'Leitor',
  EDITOR: 'Editor',
  MANAGER: 'Gestor',
};
export const roleCapabilities: Record<ProjectRole, string[]> = {
  VIEWER: [
    'project.read',
    'testcase.read',
    'testrun.read',
    'defect.read',
    'testvault.read',
    'testvault.reveal',
  ],
  EDITOR: [
    'project.read',
    'project.update',
    'milestone.manage',
    'environment.manage',
    'testcase.read',
    'testcase.create',
    'testcase.update',
    'testrun.read',
    'testrun.execute',
    'defect.read',
    'defect.manage',
    'testvault.read',
    'testvault.reveal',
    'testvault.manage',
  ],
  MANAGER: [
    'project.read',
    'project.update',
    'project.archive',
    'project.manage_members',
    'milestone.manage',
    'environment.manage',
    'testcase.read',
    'testcase.create',
    'testcase.update',
    'testrun.read',
    'testrun.execute',
    'defect.read',
    'defect.manage',
    'testvault.read',
    'testvault.reveal',
    'testvault.manage',
    'testcase.archive',
    'testrun.manage',
  ],
};
export const milestoneLabels: Record<MilestoneStatus, string> = {
  PLANNED: 'Planejado',
  IN_PROGRESS: 'Em andamento',
  COMPLETED: 'Concluído',
  CANCELLED: 'Cancelado',
};
export function canChange(project: Project, permission: string): boolean {
  return project.status === 'ACTIVE' && project.permissions.includes(permission);
}
export function calendarDate(value: string | null): string {
  return value ? value.split('-').reverse().join('/') : '—';
}
export function validCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1000) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
