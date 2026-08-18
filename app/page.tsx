import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';

export default async function RootPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role === 'CASHIER') redirect('/pos');
  if (session.role === 'PRODUCT_MANAGER') redirect('/products');
  redirect('/dashboard');
}
