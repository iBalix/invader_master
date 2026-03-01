/**
 * Page Gestion des users (admin only)
 */

import { useState, useEffect } from 'react';
import { MoreVertical, Loader, X, UserPlus } from 'lucide-react';
import { api } from '../lib/api';
import type { UserProfile, Role } from '../types';
import toast from 'react-hot-toast';

const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  salarie: 'Salarié',
  externe: 'Externe',
};

export default function UserManagementPage() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState<Role>('salarie');
  const [submitting, setSubmitting] = useState(false);

  const loadUsers = async () => {
    try {
      const { data } = await api.get<{ status: string; users: UserProfile[] }>('/api/users');
      if (data.status === 'success') setUsers(data.users);
    } catch (err) {
      toast.error('Erreur lors du chargement des utilisateurs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const openCreate = () => {
    setModalMode('create');
    setCurrentUser(null);
    setFormEmail('');
    setFormPassword('');
    setFormRole('salarie');
    setShowModal(true);
  };

  const openEdit = (user: UserProfile) => {
    setModalMode('edit');
    setCurrentUser(user);
    setFormEmail(user.email);
    setFormPassword('');
    setFormRole(user.role);
    setShowModal(true);
    setOpenDropdown(null);
  };

  const closeModal = () => {
    setShowModal(false);
    setCurrentUser(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (modalMode === 'create') {
        await api.post('/api/users', { email: formEmail, password: formPassword, role: formRole });
        toast.success('Utilisateur créé');
      } else if (currentUser) {
        await api.put(`/api/users/${currentUser.id}`, { role: formRole });
        toast.success('Rôle mis à jour');
      }
      closeModal();
      loadUsers();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Erreur';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (user: UserProfile) => {
    if (!window.confirm(`Supprimer l'utilisateur ${user.email} ?`)) return;
    setOpenDropdown(null);
    try {
      await api.delete(`/api/users/${user.id}`);
      toast.success('Utilisateur supprimé');
      loadUsers();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Erreur';
      toast.error(msg);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Gestion des users</h1>
        <button
          type="button"
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600"
        >
          <UserPlus className="w-4 h-4" />
          Ajouter un user
        </button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rôle</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Créé le</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 text-sm text-gray-900">{user.email}</td>
                <td className="px-6 py-4">
                  <span className="inline-flex px-2 py-1 text-xs font-medium rounded bg-gray-100 text-gray-800">
                    {ROLE_LABELS[user.role]}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {new Date(user.created_at).toLocaleDateString('fr-FR')}
                </td>
                <td className="px-6 py-4 text-right relative">
                  <button
                    type="button"
                    onClick={() => setOpenDropdown(openDropdown === user.id ? null : user.id)}
                    className="p-2 rounded hover:bg-gray-200"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                  {openDropdown === user.id && (
                    <div className="absolute right-6 mt-1 py-1 w-40 bg-white rounded-lg shadow-lg border border-gray-200 z-10">
                      <button
                        type="button"
                        onClick={() => openEdit(user)}
                        className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                      >
                        Modifier le rôle
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(user)}
                        className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                      >
                        Supprimer
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-900">
                {modalMode === 'create' ? 'Ajouter un user' : 'Modifier le rôle'}
              </h2>
              <button type="button" onClick={closeModal} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  required
                  disabled={modalMode === 'edit'}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg disabled:bg-gray-100"
                />
              </div>
              {modalMode === 'create' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mot de passe</label>
                  <input
                    type="password"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rôle</label>
                <select
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value as Role)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="admin">Admin</option>
                  <option value="salarie">Salarié</option>
                  <option value="externe">Externe</option>
                </select>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50"
                >
                  {submitting ? 'Envoi...' : modalMode === 'create' ? 'Créer' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
