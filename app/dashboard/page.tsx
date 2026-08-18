import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import DashboardClient from './DashboardClient';

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'OWNER') redirect('/pos');

  return <DashboardClient ownerName={session.name} />;
}
