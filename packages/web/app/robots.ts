import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/privacy', '/terms', '/support', '/delete-account', '/pricing'],
    },
    sitemap: 'https://scholarmancy.com/sitemap.xml',
  };
}
