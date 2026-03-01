export type Role = 'admin' | 'salarie' | 'externe';

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
}

export interface UserProfile {
  id: string;
  email: string;
  role: Role;
  display_name: string | null;
  created_at: string;
  updated_at: string;
}
