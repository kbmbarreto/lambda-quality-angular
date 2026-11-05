export interface ApiResponse<T> {
  data: T;
  message: string;
  meta: { requestId: string; timestamp: string };
}

export interface ApiProblem {
  code: string;
  detail?: string;
  requestId?: string;
  errors?: { field: string; code: string; message: string }[];
}

export interface User {
  id: string;
  email: string;
  displayName: string;
  status: 'ACTIVE' | 'SUSPENDED';
  emailVerifiedAt: string;
  createdAt: string;
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  refreshExpiresIn: number;
}

export interface EmailChallenge {
  challengeId: string;
  expiresIn: number;
  resendAfter: number;
}
