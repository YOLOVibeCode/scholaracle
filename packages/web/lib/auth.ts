import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import Apple from 'next-auth/providers/apple';
import AzureAD from 'next-auth/providers/azure-ad';
import type { Provider } from 'next-auth/providers';

const apiBase = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:2801/api';
const internalSecret = process.env['INTERNAL_API_SECRET'] ?? '';

const providers: Provider[] = [];
if (process.env['AUTH_GOOGLE_ID'] && process.env['AUTH_GOOGLE_SECRET']) {
  providers.push(Google);
}
if (process.env['AUTH_APPLE_ID'] && process.env['AUTH_APPLE_SECRET']) {
  providers.push(Apple);
}
if (process.env['AUTH_AZURE_AD_CLIENT_ID'] && process.env['AUTH_AZURE_AD_CLIENT_SECRET']) {
  providers.push(AzureAD);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async jwt({ token, user, account }) {
      if (account && user && internalSecret) {
        const provider = account.provider as string;
        const providerAccountId = account.providerAccountId ?? '';
        const email = (user.email ?? token.email) as string;
        const name = (user.name ?? token.name ?? email) as string;
        try {
          const res = await fetch(`${apiBase}/auth/oauth`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-internal-api-secret': internalSecret,
            },
            body: JSON.stringify({
              provider: provider === 'azure-ad' ? 'microsoft' : provider,
              providerAccountId,
              email,
              name,
            }),
          });
          const data = (await res.json()) as {
            success?: boolean;
            token?: string;
            refreshToken?: string;
            user?: { id: string; email: string; name: string };
          };
          if (data.success && data.token) {
            token.accessToken = data.token;
            token.refreshToken = data.refreshToken;
            token.userId = data.user?.id;
          }
        } catch {
          // leave token unchanged on error
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token.accessToken) {
        (session as { accessToken?: string; refreshToken?: string; userId?: string }).accessToken = token.accessToken as string;
        (session as { accessToken?: string; refreshToken?: string; userId?: string }).refreshToken = token.refreshToken as string;
        (session as { accessToken?: string; refreshToken?: string; userId?: string }).userId = token.userId as string;
      }
      return session;
    },
    redirect() {
      return '/dashboard';
    },
  },
});
