import type { MetadataRoute } from 'next';

const ORIGIN = 'https://scholarmancy.com';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    '',
    '/privacy',
    '/terms',
    '/support',
    '/delete-account',
    '/pricing',
    '/login',
    '/register',
  ].map((path) => ({
    url: `${ORIGIN}${path}`,
    lastModified: new Date('2026-08-27'),
    changeFrequency: path === '' ? 'weekly' : 'monthly',
    priority: path === '' ? 1 : 0.6,
  }));
}
