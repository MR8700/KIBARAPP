import './globals.css';
import type { ReactNode } from 'react';
import type { Viewport } from 'next';
export const metadata = { title: 'KIBAR APP', description: 'Recrutement simple, sécurisé, mobile-first', applicationName: 'KIBAR', appleWebApp: { capable: true, title: 'KIBAR', statusBarStyle: 'default' as const } };
export const viewport: Viewport = { themeColor: '#1E40AF', width: 'device-width', initialScale: 1, viewportFit: 'cover' };
export default function Root({ children }: { children: ReactNode }) {
  return (<html lang="fr"><head>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@600;700&display=swap" />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=block" />
  </head><body>{children}</body></html>);
}

