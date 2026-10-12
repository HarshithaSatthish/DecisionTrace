import { ClerkProvider } from '@clerk/nextjs';
import Providers from '@/components/layout/providers';
import { Toaster } from '@/components/ui/sonner';
import { fontVariables } from '@/components/themes/font.config';
import { DEFAULT_THEME, THEMES } from '@/components/themes/theme.config';
import ThemeProvider from '@/components/themes/theme-provider';
import { cn } from '@/lib/utils';
import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import NextTopLoader from 'nextjs-toploader';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import '../styles/globals.css';

const META_THEME_COLORS = {
  light: '#ffffff',
  dark: '#09090b'
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://decisiontrace.app'),
  title: {
    default: 'DecisionTrace — Autonomous Decision & Commitment Guardian',
    template: '%s | DecisionTrace'
  },
  description:
    'Autonomous Decision & Commitment Guardian — Track decisions, monitor commitments, detect conflicts and govern automated approvals.',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: 'any' }
    ],
    apple: '/favicon.svg'
  },
  openGraph: {
    title: 'DecisionTrace — Autonomous Decision & Commitment Guardian',
    description:
      'Autonomous Decision & Commitment Guardian — Track decisions, monitor commitments, detect conflicts and govern automated approvals.',
    siteName: 'DecisionTrace',
    type: 'website'
  },
  twitter: {
    card: 'summary',
    title: 'DecisionTrace — Autonomous Decision & Commitment Guardian',
    description:
      'Autonomous Decision & Commitment Guardian — Track decisions, monitor commitments, detect conflicts and govern automated approvals.'
  }
};

export const viewport: Viewport = {
  themeColor: META_THEME_COLORS.light
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const activeThemeValue = cookieStore.get('active_theme')?.value;
  const isValidTheme = THEMES.some((t) => t.value === activeThemeValue);
  const themeToApply = isValidTheme ? activeThemeValue! : DEFAULT_THEME;

  return (
    <html lang='en' suppressHydrationWarning data-theme={themeToApply}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                // Set meta theme color
                if (localStorage.theme === 'dark' || ((!('theme' in localStorage) || localStorage.theme === 'system') && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '${META_THEME_COLORS.dark}')
                }
              } catch (_) {}
            `
          }}
        />
      </head>
      <body
        className={cn(
          'bg-background overflow-x-hidden overscroll-none font-sans antialiased',
          fontVariables
        )}
      >
        <ClerkProvider>
          <NextTopLoader color='var(--primary)' showSpinner={false} />
          <NuqsAdapter>
            <ThemeProvider
              attribute='class'
              defaultTheme='light'
              enableSystem={false}
              disableTransitionOnChange
              enableColorScheme
            >
              <Providers activeThemeValue={themeToApply}>
                <Toaster />
                {children}
              </Providers>
            </ThemeProvider>
          </NuqsAdapter>
        </ClerkProvider>
      </body>
    </html>
  );
}
