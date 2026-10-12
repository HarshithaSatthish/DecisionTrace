import { Metadata } from 'next';
import SignUpViewPage from '@/features/auth/components/sigin-up-view';

export const metadata: Metadata = {
  title: 'Sign Up',
  description: 'Create a new DecisionTrace account to access autonomous decision tracking'
};

export default function SignUpPage() {
  return <SignUpViewPage />;
}
