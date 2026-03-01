/**
 * Shared backend types: Role, UserProfile, Express request extension
 */

export type Role = 'admin' | 'salarie' | 'externe';

export interface UserProfile {
  id: string;
  email: string;
  role: Role;
  display_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
}
