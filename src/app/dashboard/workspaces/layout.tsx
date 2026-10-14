import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Workspaces',
  description:
    'Manage DecisionTrace team workspaces, tenant isolation, and organization memberships'
};

export default function WorkspacesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
