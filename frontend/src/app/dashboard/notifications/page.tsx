import NotificationsPage from '@/features/notifications/components/notifications-page';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Notifications',
  description: 'Guardian contradiction alerts, consensus updates, and approval requests'
};

export default function Page() {
  return <NotificationsPage />;
}
