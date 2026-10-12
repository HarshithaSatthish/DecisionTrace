import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Billing',
  description: 'Manage subscription plans, billing details, and workspace quotas'
};

export default function BillingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
