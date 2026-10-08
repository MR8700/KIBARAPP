import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'KIBAR APP', short_name: 'KIBAR', description: 'Recrutement simple, sécurisé, mobile-first',
    start_url: '/', display: 'standalone', background_color: '#F8FAFC', theme_color: '#1E40AF', lang: 'fr',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
