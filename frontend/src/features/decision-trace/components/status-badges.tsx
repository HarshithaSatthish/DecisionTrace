import React from 'react';
import { Badge } from '@/components/ui/badge';
import {
  DecisionStatus,
  CommitmentStatus,
  CommitmentPriority,
  ConflictSeverity,
  ApprovalStatus,
  ImpactLevel
} from '../types';

export function DecisionStatusBadge({ status }: { status: DecisionStatus }) {
  switch (status) {
    case 'active':
      return (
        <Badge
          variant='outline'
          className='border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
        >
          Active
        </Badge>
      );
    case 'under_review':
      return (
        <Badge
          variant='outline'
          className='border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
        >
          Under Review
        </Badge>
      );
    case 'superseded':
      return (
        <Badge
          variant='outline'
          className='border-zinc-400 bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
        >
          Superseded
        </Badge>
      );
    case 'deprecated':
      return (
        <Badge
          variant='outline'
          className='border-rose-400 bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
        >
          Deprecated
        </Badge>
      );
    default:
      return <Badge variant='outline'>{status}</Badge>;
  }
}

export function CommitmentStatusBadge({ status }: { status: CommitmentStatus }) {
  switch (status) {
    case 'backlog':
      return (
        <Badge
          variant='outline'
          className='border-zinc-300 bg-zinc-50 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
        >
          Planned
        </Badge>
      );
    case 'in_progress':
      return (
        <Badge
          variant='outline'
          className='border-indigo-500/40 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300'
        >
          In Progress
        </Badge>
      );
    case 'blocked':
      return (
        <Badge
          variant='outline'
          className='border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300'
        >
          Blocked / At Risk
        </Badge>
      );
    case 'completed':
      return (
        <Badge
          variant='outline'
          className='border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
        >
          Completed
        </Badge>
      );
    default:
      return <Badge variant='outline'>{status}</Badge>;
  }
}

export function PriorityBadge({ priority }: { priority: CommitmentPriority }) {
  switch (priority) {
    case 'critical':
      return (
        <Badge variant='destructive' className='h-5 px-1.5 text-[10px] uppercase font-semibold'>
          Critical
        </Badge>
      );
    case 'high':
      return (
        <Badge
          variant='outline'
          className='border-rose-500/40 bg-rose-500/10 text-rose-700 h-5 px-1.5 text-[10px] uppercase font-semibold'
        >
          High
        </Badge>
      );
    case 'medium':
      return (
        <Badge
          variant='outline'
          className='border-amber-500/40 bg-amber-500/10 text-amber-700 h-5 px-1.5 text-[10px] uppercase font-semibold'
        >
          Medium
        </Badge>
      );
    case 'low':
      return (
        <Badge
          variant='outline'
          className='border-zinc-300 text-zinc-600 h-5 px-1.5 text-[10px] uppercase font-semibold'
        >
          Low
        </Badge>
      );
    default:
      return <Badge variant='outline'>{priority}</Badge>;
  }
}

export function ConflictSeverityBadge({ severity }: { severity: ConflictSeverity }) {
  switch (severity) {
    case 'critical':
      return (
        <Badge variant='destructive' className='gap-1'>
          <span className='size-1.5 rounded-full bg-white animate-pulse' />
          Critical Contradiction
        </Badge>
      );
    case 'high':
      return (
        <Badge
          variant='outline'
          className='border-rose-500/40 bg-rose-500/10 text-rose-700 font-medium'
        >
          High Severity
        </Badge>
      );
    case 'medium':
      return (
        <Badge
          variant='outline'
          className='border-amber-500/40 bg-amber-500/10 text-amber-700 font-medium'
        >
          Medium Severity
        </Badge>
      );
    default:
      return <Badge variant='outline'>{severity}</Badge>;
  }
}

export function ApprovalStatusBadge({ status }: { status: ApprovalStatus }) {
  switch (status) {
    case 'pending':
      return (
        <Badge variant='outline' className='border-amber-500/40 bg-amber-500/10 text-amber-700'>
          Pending Review
        </Badge>
      );
    case 'approved':
      return (
        <Badge
          variant='outline'
          className='border-emerald-500/40 bg-emerald-500/10 text-emerald-700'
        >
          Consensus Approved
        </Badge>
      );
    case 'rejected':
      return (
        <Badge variant='outline' className='border-rose-500/40 bg-rose-500/10 text-rose-700'>
          Rejected
        </Badge>
      );
    default:
      return <Badge variant='outline'>{status}</Badge>;
  }
}

export function ImpactBadge({ impact }: { impact: ImpactLevel }) {
  switch (impact) {
    case 'critical':
      return <Badge variant='destructive'>Critical Impact</Badge>;
    case 'high':
      return (
        <Badge variant='outline' className='border-rose-500 text-rose-700'>
          High Impact
        </Badge>
      );
    case 'medium':
      return (
        <Badge variant='outline' className='border-amber-500 text-amber-700'>
          Medium Impact
        </Badge>
      );
    case 'low':
      return (
        <Badge variant='outline' className='text-muted-foreground'>
          Low Impact
        </Badge>
      );
  }
}
