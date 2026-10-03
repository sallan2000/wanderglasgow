// Browser auth fixture: record auth calls without a Supabase client or network.
type AuthCall = { email: string; redirectTo?: string };
type PasswordCall = { password: string };

const testSession = {
  access_token: 'fixture-access-token',
  refresh_token: 'fixture-refresh-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: 4_102_444_800,
  user: {
    id: 'fixture-admin',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'admin@example.invalid',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    created_at: '2026-01-01T00:00:00.000Z',
  },
};

export const authFixture = {
  resetRequests: [] as AuthCall[],
  passwordUpdates: [] as PasswordCall[],
};

if (typeof window !== 'undefined') {
  Object.assign(window, { authFixture });
}

const params = () => new URLSearchParams(window.location.search);
const sessionForUrl = () => params().get('session') === 'none' ? null : testSession;

export const initialPasswordRecovery = typeof window !== 'undefined' &&
  new URLSearchParams(window.location.hash.slice(1)).get('type') === 'recovery';

export class CatalogueError extends Error {}

export async function checkAdmin() {
  return true;
}

export const supabase = {
  auth: {
    async getSession() {
      return { data: { session: sessionForUrl() }, error: null };
    },
    onAuthStateChange(_callback: (event: string, session: typeof testSession | null) => void) {
      return { data: { subscription: { unsubscribe() {} } } };
    },
    async resetPasswordForEmail(email: string, options?: { redirectTo?: string }) {
      authFixture.resetRequests.push({ email, redirectTo: options?.redirectTo });
      return { error: null };
    },
    async updateUser({ password }: { password: string }) {
      authFixture.passwordUpdates.push({ password });
      if (params().get('update') === 'expired') {
        return { error: { message: 'Invalid or expired recovery link' } };
      }
      return { error: null };
    },
    async signInWithPassword() {
      return { error: null };
    },
    async signOut() {
      return { error: null };
    },
  },
};