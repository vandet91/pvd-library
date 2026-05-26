/**
 * Minimal layout for print-only pages.
 * No sidebar, no header — just the content.
 * Inherits [locale]/layout.tsx (i18n) and app/layout.tsx (root).
 */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
