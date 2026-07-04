import { RegistryRow } from '../types';

type InvoiceState = {
  data: RegistryRow[];
  trash: RegistryRow[];
};

async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const getAuthStatus = () =>
  api<{ authenticated: boolean; user: { name: string } | null }>('/api/auth/status');

export const login = (username: string, password: string) =>
  api<{ authenticated: boolean; user: { name: string } | null }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });

export const logout = () =>
  api<{ authenticated: boolean }>('/api/auth/logout', {
    method: 'POST',
  });

export const getInvoices = () => api<InvoiceState>('/api/invoices');

export const importRows = (rows: RegistryRow[]) =>
  api<InvoiceState>('/api/invoices/import', {
    method: 'POST',
    body: JSON.stringify({ rows }),
  });

export const updateInvoiceField = (id: string, field: string, value: any) =>
  api<RegistryRow>(`/api/invoices/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ field, value }),
  });

export const deleteInvoices = (ids: string[]) =>
  api<InvoiceState>('/api/invoices/delete', {
    method: 'POST',
    body: JSON.stringify({ ids }),
  });

export const restoreInvoices = (ids: string[]) =>
  api<InvoiceState>('/api/invoices/restore', {
    method: 'POST',
    body: JSON.stringify({ ids }),
  });

export const permanentlyDeleteInvoices = (ids: string[]) =>
  api<InvoiceState>('/api/invoices', {
    method: 'DELETE',
    body: JSON.stringify({ ids }),
  });
