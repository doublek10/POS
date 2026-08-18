import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import ProductsClient from './ProductsClient';

export default async function ProductsPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role === 'CASHIER') redirect('/pos');

  return <ProductsClient />;
}
