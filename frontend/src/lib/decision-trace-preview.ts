/**
 * Checks whether development preview mode is permitted.
 * In strict production without NEXT_PUBLIC_DECISIONTRACE_DEMO_PREVIEW=true,
 * mock fixtures are strictly prohibited.
 *
 * This function is isomorphic and safe to use in BOTH Server and Client components.
 */
export function isDevPreviewEnabled(): boolean {
  return (
    process.env.NODE_ENV !== 'production' ||
    process.env.NEXT_PUBLIC_DECISIONTRACE_DEMO_PREVIEW === 'true'
  );
}
