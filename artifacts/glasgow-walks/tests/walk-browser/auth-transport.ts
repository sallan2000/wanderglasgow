// Browser auth fixture: record auth calls without a Supabase client or network.
type AuthCall = { email: string; redirectTo?: string };
type PasswordCall = { password: string };
type SignInCall = { email: string };
type AuthListener = (event: string, session: typeof testSession | null) => void;

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
  signInRequests: [] as SignInCall[],
  authEvents: [] as string[],
  signedOutSessions: [] as (typeof testSession | null)[],
  adminChecks: [] as boolean[],
};

const authListeners = new Set<AuthListener>();

if (typeof window !== 'undefined') {
  Object.assign(window, { authFixture });
}

const params = () => new URLSearchParams(window.location.search);
const sessionForUrl = () => params().get('session') === 'none' ? null : testSession;

export const initialPasswordRecovery = typeof window !== 'undefined' &&
  new URLSearchParams(window.location.hash.slice(1)).get('type') === 'recovery';

export class CatalogueError extends Error {}

export async function checkAdmin() {
  authFixture.adminChecks.push(true);
  return true;
}

export const supabase = {
  auth: {
    async getSession() {
      return { data: { session: sessionForUrl() }, error: null };
    },
    onAuthStateChange(callback: (event: string, session: typeof testSession | null) => void) {
      authListeners.add(callback);
      const mockAuthEvent = params().get('mockAuthEvent');
      if (mockAuthEvent) {
        authFixture.authEvents.push(mockAuthEvent);
        callback(mockAuthEvent, sessionForUrl());
      }
      return { data: { subscription: { unsubscribe() { authListeners.delete(callback); } } } };
    },
    async resetPasswordForEmail(email: string, options?: { redirectTo?: string }) {
      authFixture.resetRequests.push({ email, redirectTo: options?.redirectTo });
      if (params().get('reset') === 'reject-once' && authFixture.resetRequests.length === 1) {
        throw new Error('Network request failed');
      }
      return { error: null };
    },
    async updateUser({ password }: { password: string }) {
      authFixture.passwordUpdates.push({ password });
      if (params().get('update') === 'reject-once' && authFixture.passwordUpdates.length === 1) {
        throw new Error('Network request failed');
      }
      if (params().get('update') === 'expired') {
        return { error: { message: 'Invalid or expired recovery link' } };
      }
      return { error: null };
    },
    async signInWithPassword({ email }: { email: string; password: string }) {
      authFixture.signInRequests.push({ email });
      if (params().get('signin') === 'throw-once' && authFixture.signInRequests.length === 1) {
        throw new Error('Network request failed');
      }
      if (params().get('signin') === 'reject') {
        return { error: { message: 'Invalid login credentials' } };
      }
      return { error: null };
    },
    async signOut() {
      authFixture.authEvents.push('SIGNED_OUT');
      authFixture.signedOutSessions.push(null);
      for (const callback of authListeners) callback('SIGNED_OUT', null);
      return { error: null };
    },
  },
};