import { Metadata } from 'next';
import SignInViewPage from '@/features/auth/components/sign-in-view';

export const metadata: Metadata = {
  title: 'Sign In',
  description: 'Sign in to DecisionTrace to access the Autonomous Decision & Commitment Guardian'
};

export default function SignInPage() {
  return <SignInViewPage />;
}
