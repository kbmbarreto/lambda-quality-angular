import { ListQuery } from '../workspaces/workspace.models';
export interface VaultEntry {
  id: string;
  workspaceId: string;
  projectId: string;
  environmentId: string | null;
  name: string;
  version: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: null;
}
export interface VaultSecret {
  username: string;
  password: string;
  url: string | null;
  notes: string | null;
}
export interface RevealedEntry extends VaultSecret {
  id: string;
  version: number;
}
export interface VaultQuery extends ListQuery {
  environmentId?: string;
}
export interface VaultCreate extends VaultSecret {
  name: string;
  environmentId?: string | null;
}
export interface VaultUpdate {
  version: number;
  name?: string;
  environmentId?: string | null;
  secret?: VaultSecret;
}
