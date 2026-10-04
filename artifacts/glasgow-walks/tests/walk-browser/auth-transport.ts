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

const makeSession = (id: string, email: string): typeof testSession => ({
  ...testSession,
  user: { ...testSession.user, id, email },
});

const params = () => new URLSearchParams(window.location.search);
let currentSession: typeof testSession | null = params().get('session') === 'none' ? null : testSession;
const adminAccess = new Map([[testSession.user.id, true]]);
const authListeners = new Set<AuthListener>();
const heldAdminChecks = new Set<string>();
const pendingAdminChecks = new Map<string, () => void>();

export const authFixture = {
  resetRequests: [] as AuthCall[],
  passwordUpdates: [] as PasswordCall[],
  signInRequests: [] as SignInCall[],
  authEvents: [] as string[],
  signedOutSessions: [] as (typeof testSession | null)[],
  adminChecks: [] as boolean[],
  adminCheckUserIds: [] as string[],
  adminCheckResults: [] as boolean[],
  holdAdminCheck(userId: string) {
    heldAdminChecks.add(userId);
  },
  releaseAdminCheck(userId: string) {
    heldAdminChecks.delete(userId);
    pendingAdminChecks.get(userId)?.();
    pendingAdminChecks.delete(userId);
  },
  switchAccount(userId: string, email: string, isAdmin: boolean) {
    const nextSession = makeSession(userId, email);
    currentSession = nextSession;
    adminAccess.set(userId, isAdmin);
    authFixture.authEvents.push('SIGNED_IN');
    for (const callback of authListeners) callback('SIGNED_IN', nextSession);
  },
};

if (typeof window !== 'undefined') {
  Object.assign(window, { authFixture });
}

export const initialPasswordRecovery = typeof window !== 'undefined' &&
  new URLSearchParams(window.location.hash.slice(1)).get('type') === 'recovery';

export class CatalogueError extends Error {}

export async function checkAdmin() {
  const userId = currentSession?.user.id ?? '';
  const allowed = adminAccess.get(userId) === true;
  authFixture.adminChecks.push(true);
  authFixture.adminCheckUserIds.push(userId);
  authFixture.adminCheckResults.push(allowed);
  if (heldAdminChecks.has(userId)) {
    await new Promise<void>((resolve) => pendingAdminChecks.set(userId, resolve));
  }
  return allowed;
}

export const supabase = {
  auth: {
    async getSession() {
      return { data: { session: currentSession }, error: null };
    },
    onAuthStateChange(callback: (event: string, session: typeof testSession | null) => void) {
      authListeners.add(callback);
      const mockAuthEvent = params().get('mockAuthEvent');
      if (mockAuthEvent) {
        authFixture.authEvents.push(mockAuthEvent);
        callback(mockAuthEvent, currentSession);
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
      currentSession = null;
      authFixture.signedOutSessions.push(null);
      for (const callback of authListeners) callback('SIGNED_OUT', null);
      return { error: null };
    },
  },
};