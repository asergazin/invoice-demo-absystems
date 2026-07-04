import React, { useState } from 'react';

interface LoginPageProps {
  onLogin: (username: string, password: string) => Promise<void>;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await onLogin(username.trim(), password);
    } catch (loginError: any) {
      setError(loginError.message || 'Не удалось войти');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center px-6 py-10 font-sans">
      <section className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-xl shadow-slate-200/60 overflow-hidden">
        <div className="px-8 pt-8 pb-6 border-b border-slate-100">
          <img
            src="/ab-systems-logo.png"
            alt="A&B Systems"
            className="h-12 w-auto object-contain mb-8"
          />
          <h1 className="text-2xl font-semibold text-slate-950">Вход в реестр счетов</h1>
          <p className="text-sm text-slate-500 mt-2">A&amp;B Systems Construction Company</p>
        </div>

        <form onSubmit={handleSubmit} className="px-8 py-7 space-y-5">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Логин</span>
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
              required
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Пароль</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
              required
            />
          </label>

          {error && (
            <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-100 transition hover:bg-blue-800 disabled:bg-slate-300"
          >
            {isSubmitting ? 'Входим...' : 'Войти'}
          </button>
        </form>
      </section>
    </main>
  );
};
