import { ApiResponse } from '../../core/api.models';

export interface Pagination {
  page: number;
  size: number;
  totalItems: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}
export interface Page<T> extends ApiResponse<T[]> {
  meta: ApiResponse<T[]>['meta'] & { pagination: Pagination };
}
export interface ListQuery {
  page?: number;
  size?: number;
  sort?: string;
  q?: string;
  status?: string;
  roleId?: string;
  groupId?: string;
}
export interface Workspace {
  id: string;
  name: string;
  slug: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
  ownerMemberId: string;
  createdAt: string;
  updatedAt: string;
  memberId?: string;
  isOwner?: boolean;
  permissions?: string[];
}
export interface Member {
  id: string;
  workspaceId: string;
  userId: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'REMOVED';
  joinedAt: string;
  isOwner: boolean;
  user: {
    id: string;
    email: string;
    displayName: string;
    status: 'ACTIVE' | 'SUSPENDED';
    emailVerifiedAt: string;
  };
  roles: { id: string; name: string; source: 'DIRECT' | 'GROUP'; groupId: string | null }[];
  groups: { id: string; name: string }[];
}
export interface Invitation {
  id: string;
  workspaceId: string;
  email: string;
  status: 'PENDING' | 'ACCEPTED' | 'CANCELED' | 'EXPIRED';
  deliveryStatus: 'PENDING' | 'SENT' | 'FAILED';
  expiresAt: string;
  invitedBy: string;
  acceptedAt: string | null;
  createdAt: string;
  lastSentAt: string;
}
export interface Role {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  systemRole: boolean;
  createdAt: string;
  permissionCodes: string[];
}
export interface Group {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  createdAt: string;
  roleIds: string[];
  memberCount: number;
}
export interface CustomField {
  id: string;
  workspaceId: string;
  key: string;
  name: string;
  description: string | null;
  type: 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'DATE' | 'SINGLE_SELECT';
  target: 'TEST_CASE';
  required: boolean;
  position: number;
  options: { id: string; label: string }[];
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface Tag {
  id: string;
  workspaceId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}
export interface Attachment {
  id: string;
  workspaceId: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  checksum: string;
  uploadedBy: string;
  createdAt: string;
}
export interface Permission {
  code: string;
  description: string;
}
export interface Resources {
  members: Member;
  invitations: Invitation;
  roles: Role;
  groups: Group;
  'custom-fields': CustomField;
  tags: Tag;
  attachments: Attachment;
}
export type Resource = keyof Resources;
export type Creatable = 'roles' | 'groups' | 'custom-fields' | 'tags';
export interface CreateBodies {
  roles: { name: string; description: string | null; permissionCodes: string[] };
  groups: { name: string; description: string | null };
  'custom-fields': {
    key: string;
    name: string;
    description: string | null;
    type: CustomField['type'];
    target: 'TEST_CASE';
    required: boolean;
    position: number;
    options: string[];
  };
  tags: { name: string };
}
export interface UpdateBodies {
  roles: CreateBodies['roles'];
  groups: CreateBodies['groups'];
  'custom-fields': Pick<CustomField, 'name' | 'description' | 'required' | 'position'>;
  tags: CreateBodies['tags'];
}
