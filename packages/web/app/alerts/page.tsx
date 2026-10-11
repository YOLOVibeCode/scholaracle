import { redirect } from 'next/navigation';

/** Short link used in alert texts (scholarmancy.com/alerts) to keep each text one segment. */
export default function AlertsShortLink(): never {
  redirect('/dashboard/alerts');
}
