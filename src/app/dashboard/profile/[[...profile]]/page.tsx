import ProfileViewPage from '@/features/profile/components/profile-view-page';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Profile',
  description: 'User profile settings, credentials, and session preferences'
};

export default async function Page() {
  return <ProfileViewPage />;
}
