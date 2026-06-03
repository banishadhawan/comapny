import { getSessionUser } from '@/lib/auth';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const user = await getSessionUser();

  if (!user) {
    redirect('/login');
  } else if (user.role === 'admin') {
    redirect('/admin');
  } else {
    redirect('/seller');
  }
}
