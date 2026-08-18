'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { signOut } from '@/lib/auth/logout-client';

interface Employee {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: 'ACTIVE' | 'DISABLED';
  role: { name: 'OWNER' | 'PRODUCT_MANAGER' | 'CASHIER' };
}

const ROLE_LABEL: Record<string, string> = {
  OWNER: 'Owner',
  PRODUCT_MANAGER: 'Product Manager',
  CASHIER: 'Cashier',
};

export default function EmployeesClient() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    role: 'CASHIER' as 'PRODUCT_MANAGER' | 'CASHIER',
  });
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const data = await apiFetch<{ users: Employee[] }>('/api/users');
    setEmployees(data.users);
  }

  useEffect(() => {
    load();
  }, []);

  async function createEmployee(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/api/users', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setForm({ name: '', email: '', phone: '', password: '', role: 'CASHIER' });
      setShowForm(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add employee');
    }
  }

  async function toggleStatus(employee: Employee) {
    setBusyId(employee.id);
    try {
      const nextStatus = employee.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
      await apiFetch(`/api/users/${employee.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update employee');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-screen bg-paper">
      <header className="flex items-center justify-between px-8 py-5 bg-white border-b border-black/5">
        <div>
          <p className="text-xs text-ink/40 uppercase tracking-wide">Staff</p>
          <h1 className="text-lg font-semibold">Employees</h1>
        </div>
        <nav className="flex items-center gap-5 text-sm">
          <a href="/dashboard" className="text-ink/60 hover:text-ink">Dashboard</a>
          <a href="/products" className="text-ink/60 hover:text-ink">Products</a>
          <a href="/pos" className="text-ink/60 hover:text-ink">POS</a>
          <button
            onClick={() => setShowForm((s) => !s)}
            className="rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-4 py-2"
          >
            + Add employee
          </button>
          <button onClick={signOut} className="text-ink/60 hover:text-ink">Sign out</button>
        </nav>
      </header>

      <main className="p-8 max-w-4xl mx-auto">
        {showForm && (
          <form onSubmit={createEmployee} className="bg-white rounded-xl border border-black/5 p-5 mb-6 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Full name">
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" />
              </Field>
              <Field label="Role">
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as 'PRODUCT_MANAGER' | 'CASHIER' })}
                  className="input"
                >
                  <option value="CASHIER">Cashier</option>
                  <option value="PRODUCT_MANAGER">Product Manager</option>
                </select>
              </Field>
              <Field label="Email">
                <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input" />
              </Field>
              <Field label="Phone (optional)">
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input" />
              </Field>
              <Field label="Temporary password">
                <input required type="text" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="input" placeholder="At least 8 characters" />
              </Field>
            </div>
            <div className="flex items-center gap-3">
              <button type="submit" className="rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-4 py-2.5">
                Create account
              </button>
              {error && <p className="text-sm text-danger">{error}</p>}
            </div>
          </form>
        )}

        <div className="bg-white rounded-xl border border-black/5 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink/40 text-xs uppercase bg-black/[0.02]">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => (
                <tr key={emp.id} className="border-t border-black/5">
                  <td className="px-4 py-3">{emp.name}</td>
                  <td className="px-4 py-3 text-ink/50">{emp.email}</td>
                  <td className="px-4 py-3">{ROLE_LABEL[emp.role.name]}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        emp.status === 'ACTIVE' ? 'bg-brand-50 text-brand-700' : 'bg-black/5 text-ink/50'
                      }`}
                    >
                      {emp.status === 'ACTIVE' ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {emp.role.name === 'OWNER' ? (
                      <span className="text-ink/30 text-xs">—</span>
                    ) : (
                      <button
                        onClick={() => toggleStatus(emp)}
                        disabled={busyId === emp.id}
                        className="text-xs font-medium text-ink/60 hover:text-ink disabled:opacity-50"
                      >
                        {emp.status === 'ACTIVE' ? 'Disable' : 'Re-enable'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {employees.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-ink/40">
                    No employees yet — add your first cashier or product manager above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-ink/50 mb-1">{label}</span>
      {children}
    </label>
  );
}
