import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import EmployeesClient from './EmployeesClient';

export default async function EmployeesPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  // Owner-only per spec section 2 ("Add product managers", "Add
  // cashiers", "Remove employees" are all owner capabilities). The API
  // enforces this too — this redirect is just so a manager/cashier
  // never lands on a page that would 403 on every action anyway.
  if (session.role !== 'OWNER') redirect('/pos');

  return <EmployeesClient />;
}
