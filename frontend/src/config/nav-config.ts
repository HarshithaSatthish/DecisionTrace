import { NavGroup } from '@/types';

/**
 * Navigation configuration with RBAC support
 *
 * This configuration is used for both the sidebar navigation and Cmd+K bar.
 * Items are organized into groups, each rendered with a SidebarGroupLabel.
 *
 * RBAC Access Control:
 * Each navigation item can have an `access` property that controls visibility
 * based on permissions, plans, features, roles, and organization context.
 *
 * Examples:
 *
 * 1. Require organization:
 *    access: { requireOrg: true }
 *
 * 2. Require specific permission:
 *    access: { requireOrg: true, permission: 'org:teams:manage' }
 *
 * 3. Require specific plan:
 *    access: { plan: 'pro' }
 *
 * 4. Require specific feature:
 *    access: { feature: 'premium_access' }
 *
 * 5. Require specific role:
 *    access: { role: 'admin' }
 *
 * 6. Multiple conditions (all must be true):
 *    access: { requireOrg: true, permission: 'org:teams:manage', plan: 'pro' }
 *
 * Note: The `visible` function is deprecated but still supported for backward compatibility.
 * Use the `access` property for new items.
 */
export const navGroups: NavGroup[] = [
  {
    label: 'Guardian Operations',
    items: [
      {
        title: 'Overview',
        url: '/dashboard/overview',
        icon: 'dashboard',
        isActive: false,
        shortcut: ['o', 'v'],
        items: []
      },
      {
        title: 'Decisions',
        url: '/dashboard/decisions',
        icon: 'decisions',
        isActive: false,
        shortcut: ['d', 'e'],
        items: []
      },
      {
        title: 'Commitments',
        url: '/dashboard/commitments',
        icon: 'commitments',
        isActive: false,
        shortcut: ['c', 'm'],
        items: []
      },
      {
        title: 'Conflicts',
        url: '/dashboard/conflicts',
        icon: 'conflicts',
        isActive: false,
        shortcut: ['c', 'f'],
        items: []
      },
      {
        title: 'Approvals',
        url: '/dashboard/approvals',
        icon: 'approvals',
        isActive: false,
        shortcut: ['a', 'p'],
        items: []
      },
      {
        title: 'Conversations',
        url: '/dashboard/conversations',
        icon: 'chat',
        isActive: false,
        shortcut: ['c', 'v'],
        items: []
      },
      {
        title: 'Activity',
        url: '/dashboard/activity',
        icon: 'activity',
        isActive: false,
        shortcut: ['a', 'c'],
        items: []
      },
      {
        title: 'Omi Connection',
        url: '/dashboard/settings/omi',
        icon: 'settings',
        isActive: false,
        shortcut: ['o', 'm'],
        items: []
      }
    ]
  },
  {
    label: 'Organization',
    items: [
      {
        title: 'Workspaces',
        url: '/dashboard/workspaces',
        icon: 'workspace',
        isActive: false,
        items: []
      },
      {
        title: 'Notifications',
        url: '/dashboard/notifications',
        icon: 'notification',
        shortcut: ['n', 'n'],
        isActive: false,
        items: []
      },
      {
        title: 'Profile',
        url: '/dashboard/profile',
        icon: 'profile',
        shortcut: ['p', 'r'],
        isActive: false,
        items: []
      }
    ]
  }
];
