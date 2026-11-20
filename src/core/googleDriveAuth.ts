import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

export const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
] as const;

export interface DriveUserProfile {
  email?: string | null;
  displayName?: string | null;
}

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
for (const scope of SCOPES) {
  provider.addScope(scope);
}
provider.setCustomParameters({
  prompt: 'consent select_account',
});

// Track active popup sign-in flow and cache OAuth access token strictly in memory
let isSigningIn = false;
let cachedAccessToken: string | null = null;
let cachedUserProfile: DriveUserProfile | null = null;

// Google Identity Services (GIS) preloaded script state for fallback when Firebase iframe popup is blocked
let gisScriptPromise: Promise<boolean> | null = null;
let gisTokenClient: any = null;
let pendingGisResolve: ((val: { user: DriveUserProfile; accessToken: string }) => void) | null = null;
let pendingGisReject: ((err: Error) => void) | null = null;

function mapFirebaseAuthError(err: any): Error {
  const code = String(err?.code || '');
  switch (code) {
    case 'auth/popup-blocked':
      return new Error(
        'Browser blocked the Google sign-in popup. Please allow popups or try "Direct Google OAuth".'
      );
    case 'auth/popup-closed-by-user':
      return new Error(
        'Google sign-in popup was closed before completing. If the preview iframe blocked the Firebase popup, click "Direct Google OAuth".'
      );
    case 'auth/cancelled-popup-request':
      return new Error('Sign-in popup request was superseded. Please try again.');
    case 'auth/unauthorized-domain':
      return new Error(
        `Preview domain "${typeof window !== 'undefined' ? window.location.hostname : ''}" is not authorized in Firebase Auth. Use "Direct Google OAuth" below to connect.`
      );
    case 'auth/operation-not-allowed':
      return new Error(
        'Google sign-in provider is not enabled in Firebase Auth. Use "Direct Google OAuth" below to connect.'
      );
    case 'auth/network-request-failed':
      return new Error('Network error reaching Google authentication servers. Please check your connection and try again.');
    default:
      return err instanceof Error ? err : new Error(String(err?.message || 'Google sign-in failed.'));
  }
}

export const preloadGoogleIdentityServices = async (): Promise<boolean> => {
  if (typeof window === 'undefined' || !firebaseConfig.oAuthClientId) return false;
  const w = window as any;
  if (w.google?.accounts?.oauth2) {
    ensureGisTokenClient();
    return true;
  }
  if (gisScriptPromise) return gisScriptPromise;

  gisScriptPromise = new Promise<boolean>((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener('load', () => {
        ensureGisTokenClient();
        resolve(Boolean((window as any).google?.accounts?.oauth2));
      });
      existing.addEventListener('error', () => resolve(false));
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      ensureGisTokenClient();
      resolve(Boolean((window as any).google?.accounts?.oauth2));
    };
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });

  return gisScriptPromise;
};

function ensureGisTokenClient(): any {
  if (typeof window === 'undefined' || !firebaseConfig.oAuthClientId) return null;
  const oauth2 = (window as any).google?.accounts?.oauth2;
  if (!oauth2) return null;

  if (!gisTokenClient) {
    gisTokenClient = oauth2.initTokenClient({
      client_id: firebaseConfig.oAuthClientId,
      scope: SCOPES.join(' '),
      callback: async (tokenResponse: any) => {
        if (tokenResponse?.error || !tokenResponse?.access_token) {
          const msg =
            tokenResponse?.error_description ||
            tokenResponse?.error ||
            'Google OAuth did not return an access token.';
          pendingGisReject?.(new Error(msg));
          pendingGisResolve = null;
          pendingGisReject = null;
          return;
        }

        const token = String(tokenResponse.access_token);
        cachedAccessToken = token;

        // Resolve basic profile if email scope wasn't requested or use Firebase user fallback
        let profile: DriveUserProfile = {
          email: auth.currentUser?.email || null,
          displayName: auth.currentUser?.displayName || 'Google Drive Connected',
        };
        try {
          const infoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (infoRes.ok) {
            const info = await infoRes.json();
            profile = {
              email: info?.email || profile.email,
              displayName: info?.name || info?.email || profile.displayName,
            };
          }
        } catch {
          // Non-fatal: drive.file scope may not include userinfo profile
        }
        cachedUserProfile = profile;
        pendingGisResolve?.({ user: profile, accessToken: token });
        pendingGisResolve = null;
        pendingGisReject = null;
      },
      error_callback: (err: any) => {
        const msg =
          err?.type === 'popup_closed'
            ? 'Google OAuth window was closed before completing.'
            : err?.type === 'popup_failed_to_open'
            ? 'Browser blocked the Google OAuth popup window.'
            : err?.message || 'Google OAuth sign-in failed.';
        pendingGisReject?.(new Error(msg));
        pendingGisResolve = null;
        pendingGisReject = null;
      },
    });
  }
  return gisTokenClient;
}

export const isGisDirectOAuthReady = (): boolean => {
  return Boolean(
    typeof window !== 'undefined' &&
      firebaseConfig.oAuthClientId &&
      (window as any).google?.accounts?.oauth2
  );
};

export const googleDriveSignInViaGis = async (): Promise<{
  user: DriveUserProfile;
  accessToken: string;
}> => {
  const ready = isGisDirectOAuthReady() || (await preloadGoogleIdentityServices());
  const client = ready ? ensureGisTokenClient() : null;
  if (!client) {
    throw new Error('Google Identity Services client could not be loaded in this browser.');
  }

  return new Promise<{ user: DriveUserProfile; accessToken: string }>((resolve, reject) => {
    pendingGisResolve = resolve;
    pendingGisReject = reject;
    try {
      client.requestAccessToken({ prompt: 'consent select_account' });
    } catch (err: any) {
      pendingGisResolve = null;
      pendingGisReject = null;
      reject(new Error(err?.message || 'Failed to launch Google OAuth popup.'));
    }
  });
};

export const initDriveAuth = (
  onAuthSuccess?: (user: DriveUserProfile, token: string) => void,
  onAuthFailure?: () => void
) => {
  void preloadGoogleIdentityServices();
  return onAuthStateChanged(auth, (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        cachedUserProfile = { email: user.email, displayName: user.displayName };
        onAuthSuccess?.(cachedUserProfile, cachedAccessToken);
      } else if (!isSigningIn) {
        onAuthFailure?.();
      }
    } else if (!cachedAccessToken) {
      cachedUserProfile = null;
      onAuthFailure?.();
    }
  });
};

export const googleDriveSignIn = async (): Promise<{
  user: DriveUserProfile;
  accessToken: string;
} | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error(
        'Signed in with Firebase, but Google did not return a Drive access token. Click "Direct Google OAuth" to grant Drive access.'
      );
    }
    cachedAccessToken = credential.accessToken;
    cachedUserProfile = {
      email: result.user.email,
      displayName: result.user.displayName,
    };
    return { user: cachedUserProfile, accessToken: cachedAccessToken };
  } catch (err: any) {
    throw mapFirebaseAuthError(err);
  } finally {
    isSigningIn = false;
  }
};

export const getDriveAccessToken = (): string | null => {
  return cachedAccessToken;
};

export const clearDriveAccessToken = (): void => {
  cachedAccessToken = null;
};

export const getCurrentDriveUser = (): DriveUserProfile | null => {
  if (cachedUserProfile) return cachedUserProfile;
  if (auth.currentUser) {
    return {
      email: auth.currentUser.email,
      displayName: auth.currentUser.displayName,
    };
  }
  return null;
};

export const driveLogout = async (): Promise<void> => {
  const tokenToRevoke = cachedAccessToken;
  cachedAccessToken = null;
  cachedUserProfile = null;
  try {
    const oauth2 = typeof window !== 'undefined' ? (window as any).google?.accounts?.oauth2 : null;
    if (tokenToRevoke && oauth2?.revoke) {
      oauth2.revoke(tokenToRevoke, () => {});
    }
  } catch {}
  await auth.signOut().catch(() => {});
};
