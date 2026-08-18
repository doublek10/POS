import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { prisma } from '@/lib/database/client';
import PosScreen from './components/PosScreen';

export default async function PosPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  // Any authenticated role can staff the till in this scaffold; tighten
  // to CASHIER-only with `if (session.role !== 'CASHIER') redirect(...)`
  // if owners/managers should never see this screen.
  const branch = await prisma.branch.findFirst({ where: { companyId: session.companyId } });
  if (!branch) {
    return <div className="p-8 text-sm text-ink/60">No branch configured yet. Ask the owner to set one up.</div>;
  }

  return <PosScreen cashierName={session.name} branchId={branch.id} />;
}
