import { Geist, Geist_Mono, Inter } from 'next/font/google';
import { cn } from '@/lib/utils';

// Core sans-serif variable font (modern, fast, self-hosted)
const fontSans = Geist({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
  preload: true
});

// Core monospace variable font (code, commit IDs, execution keys)
const fontMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
  preload: false
});

// Inter font for themes requesting standard enterprise sans
const fontInter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
  preload: false
});

/**
 * Optimized font variables export.
 * Reduced from 16 Google font families down to 3 essential fonts,
 * saving ~500 KB of webfont transfers and eliminating 25+ blocking HTTP requests.
 * All theme-specific font variables gracefully fall back to these via theme.css.
 */
export const fontVariables = cn(
  fontSans.variable,
  fontMono.variable,
  fontInter.variable
);
