import { describe, expect, test } from 'bun:test';
import { isDevPreviewEnabled } from '@/lib/decision-trace-auth';

describe('Server-Side Authentication & Preview Guard', () => {
  test('isDevPreviewEnabled returns true in non-production environments', () => {
    const originalEnv = process.env.NODE_ENV;
    (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
    expect(isDevPreviewEnabled()).toBe(true);
    (process.env as Record<string, string | undefined>).NODE_ENV = originalEnv;
  });

  test('isDevPreviewEnabled returns false in strict production when preview flag is unset', () => {
    const originalEnv = process.env.NODE_ENV;
    const originalFlag = process.env.NEXT_PUBLIC_DECISIONTRACE_DEMO_PREVIEW;

    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    delete process.env.NEXT_PUBLIC_DECISIONTRACE_DEMO_PREVIEW;

    expect(isDevPreviewEnabled()).toBe(false);

    (process.env as Record<string, string | undefined>).NODE_ENV = originalEnv;
    if (originalFlag) {
      process.env.NEXT_PUBLIC_DECISIONTRACE_DEMO_PREVIEW = originalFlag;
    }
  });

  test('isDevPreviewEnabled returns true in production if preview flag is explicitly set', () => {
    const originalEnv = process.env.NODE_ENV;
    const originalFlag = process.env.NEXT_PUBLIC_DECISIONTRACE_DEMO_PREVIEW;

    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    process.env.NEXT_PUBLIC_DECISIONTRACE_DEMO_PREVIEW = 'true';

    expect(isDevPreviewEnabled()).toBe(true);

    (process.env as Record<string, string | undefined>).NODE_ENV = originalEnv;
    if (originalFlag) {
      process.env.NEXT_PUBLIC_DECISIONTRACE_DEMO_PREVIEW = originalFlag;
    } else {
      delete process.env.NEXT_PUBLIC_DECISIONTRACE_DEMO_PREVIEW;
    }
  });
});
