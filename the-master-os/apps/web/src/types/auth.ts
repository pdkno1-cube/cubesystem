export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResult {
  success: boolean;
  user: User | null;
  requiresMfa: boolean;
  mfaChallenge: MfaChallenge | null;
  error: string | null;
}

export interface MfaChallenge {
  factorId: string;
  challengeId: string;
}

export interface MfaEnrollResult {
  factorId: string;
  totpUri: string;
  qrCode: string;
}

export interface MfaVerifyRequest {
  factorId: string;
  challengeId: string;
  code: string;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: User;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

export interface ApiSuccessResponse<T> {
  data: T;
}
