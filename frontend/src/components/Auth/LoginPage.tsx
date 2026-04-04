/**
 * Page de connexion
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, AlertCircle, Loader, Tablet, X, Delete } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

const IPAD_EMAIL = 'ipad@invader.bar';
const IPAD_PASSWORD = '1234';
const PIN_LENGTH = 4;

function PinModal({ open, onClose, onLogin }: {
  open: boolean;
  onClose: () => void;
  onLogin: (email: string, password: string) => Promise<void>;
}) {
  const [digits, setDigits] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setDigits('');
      setError('');
    }
  }, [open]);

  const submit = useCallback(async (pin: string) => {
    if (pin !== IPAD_PASSWORD) {
      setError('Code incorrect');
      setDigits('');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await onLogin(IPAD_EMAIL, IPAD_PASSWORD);
    } catch {
      setError('Erreur de connexion');
      setDigits('');
    } finally {
      setLoading(false);
    }
  }, [onLogin]);

  const addDigit = useCallback((d: string) => {
    setError('');
    setDigits(prev => {
      const next = prev + d;
      if (next.length >= PIN_LENGTH) {
        submit(next);
      }
      return next.length <= PIN_LENGTH ? next : prev;
    });
  }, [submit]);

  const removeDigit = useCallback(() => {
    setError('');
    setDigits(prev => prev.slice(0, -1));
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') addDigit(e.key);
      else if (e.key === 'Backspace') removeDigit();
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, addDigit, removeDigit, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        ref={containerRef}
        className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm mx-4 space-y-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Tablet className="w-6 h-6 text-primary-500" />
            <h2 className="text-xl font-bold text-gray-900">Accès iPad Bar</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-gray-500 text-center">Saisissez le code à 4 chiffres</p>

        <div className="flex justify-center gap-3">
          {Array.from({ length: PIN_LENGTH }).map((_, i) => (
            <div
              key={i}
              className={`w-14 h-14 rounded-xl border-2 flex items-center justify-center text-2xl font-bold transition-all ${
                i < digits.length
                  ? 'border-primary-500 bg-primary-50 text-primary-700'
                  : 'border-gray-200 bg-gray-50 text-transparent'
              }`}
            >
              {i < digits.length ? '\u2022' : '0'}
            </div>
          ))}
        </div>

        {error && (
          <p className="text-sm text-red-600 text-center font-medium">{error}</p>
        )}

        {loading ? (
          <div className="flex justify-center py-6">
            <Loader className="w-8 h-8 animate-spin text-primary-500" />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {['1','2','3','4','5','6','7','8','9'].map(d => (
              <button
                key={d}
                type="button"
                onClick={() => addDigit(d)}
                className="h-14 rounded-xl bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-xl font-semibold text-gray-800 transition-colors"
              >
                {d}
              </button>
            ))}
            <div />
            <button
              type="button"
              onClick={() => addDigit('0')}
              className="h-14 rounded-xl bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-xl font-semibold text-gray-800 transition-colors"
            >
              0
            </button>
            <button
              type="button"
              onClick={removeDigit}
              className="h-14 rounded-xl bg-gray-100 hover:bg-gray-200 active:bg-gray-300 flex items-center justify-center text-gray-600 transition-colors"
            >
              <Delete className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await login(email, password);
      if (result.success) {
        navigate('/');
      } else {
        setError(result.message ?? 'Erreur de connexion');
      }
    } catch {
      setError('Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  };

  const handlePinLogin = useCallback(async (pinEmail: string, pinPassword: string) => {
    const result = await login(pinEmail, pinPassword);
    if (result.success) {
      navigate('/');
    } else {
      throw new Error(result.message ?? 'Erreur');
    }
  }, [login, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8 space-y-6">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-500 rounded-full mb-4">
              <LogIn className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900">Invader Master</h1>
            <p className="text-gray-600 mt-2">Back-office du bar connecté</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Mot de passe
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-primary-500 text-white font-medium rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Loader className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <LogIn className="w-5 h-5" />
                  Connexion
                </>
              )}
            </button>
          </form>

          <button
            type="button"
            onClick={() => setPinOpen(true)}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 border-2 border-gray-200 text-gray-600 font-medium rounded-lg hover:border-primary-300 hover:text-primary-600 hover:bg-primary-50 transition-colors"
          >
            <Tablet className="w-5 h-5" />
            Connexion depuis iPad bar
          </button>
        </div>
      </div>

      <PinModal open={pinOpen} onClose={() => setPinOpen(false)} onLogin={handlePinLogin} />
    </div>
  );
}
