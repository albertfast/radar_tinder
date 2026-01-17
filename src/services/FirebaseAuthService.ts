import { NativeModules } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';

const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_FIREBASE_WEB_CLIENT_ID;
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_FIREBASE_IOS_CLIENT_ID;

let cachedFirebaseAuthModular: any | undefined;
function getFirebaseAuthModular(): any | null {
  if (cachedFirebaseAuthModular !== undefined) return cachedFirebaseAuthModular;

  if (!NativeModules?.RNFBAppModule) {
    cachedFirebaseAuthModular = null;
    return cachedFirebaseAuthModular;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    cachedFirebaseAuthModular = require('@react-native-firebase/auth/lib/modular');
  } catch (error) {
    cachedFirebaseAuthModular = null;
  }

  return cachedFirebaseAuthModular;
}

let cachedGoogleSignin: any | undefined;
function getGoogleSignin(): any | null {
  if (cachedGoogleSignin !== undefined) return cachedGoogleSignin;

  // The library throws at import-time if the native module isn't present (it creates a NativeEventEmitter).
  if (!NativeModules?.RNGoogleSignin) {
    cachedGoogleSignin = null;
    return cachedGoogleSignin;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    cachedGoogleSignin = require('@react-native-google-signin/google-signin');
  } catch (error) {
    cachedGoogleSignin = null;
  }

  return cachedGoogleSignin;
}

const createNonce = async (length: number = 32) => {
  const charset = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const bytes = await Crypto.getRandomBytesAsync(length);
  return Array.from(bytes)
    .map((b) => charset[b % charset.length])
    .join('');
};

export const FirebaseAuthService = {
  configureGoogle() {
    const googleSignin = getGoogleSignin();
    if (!googleSignin?.GoogleSignin) {
      console.warn('Google Sign-In is not available in this iOS/Android binary.');
      return;
    }

    if (!GOOGLE_WEB_CLIENT_ID) {
      console.warn('Missing EXPO_PUBLIC_FIREBASE_WEB_CLIENT_ID for Google Sign-In.');
    }
    googleSignin.GoogleSignin.configure({
      webClientId: GOOGLE_WEB_CLIENT_ID,
      iosClientId: GOOGLE_IOS_CLIENT_ID,
    });
  },

  async signInAnonymously() {
    const authModular = getFirebaseAuthModular();
    if (!authModular) {
      throw new Error(
        'Firebase Auth is not available in this iOS/Android binary (RNFBAppModule missing).'
      );
    }

    const auth = authModular.getAuth();
    if (auth?.currentUser) {
      return { uid: auth.currentUser.uid };
    }

    const result = await authModular.signInAnonymously(auth);
    if (!result?.user) {
      throw new Error('Anonymous sign-in failed: missing user');
    }
    return { uid: result.user.uid };
  },

  async signInWithGoogle() {
    const authModular = getFirebaseAuthModular();
    if (!authModular) {
      throw new Error(
        'Firebase Auth is not available in this iOS/Android binary (RNFBAppModule missing).'
      );
    }

    const googleSignin = getGoogleSignin();
    if (!googleSignin?.GoogleSignin) {
      throw new Error('Google Sign-In is not available in this iOS/Android binary.');
    }

    await googleSignin.GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const { idToken, user } = await googleSignin.GoogleSignin.signIn();
    if (!idToken) {
      throw new Error('Google sign-in failed: missing idToken');
    }

    const auth = authModular.getAuth();
    const credential = authModular.GoogleAuthProvider.credential(idToken);
    await authModular.signInWithCredential(auth, credential);

    return {
      idToken,
      profile: {
        email: user.email,
        displayName: user.name,
        avatarUrl: user.photo,
      },
    };
  },

  async signInWithApple() {
    const authModular = getFirebaseAuthModular();
    if (!authModular) {
      throw new Error(
        'Firebase Auth is not available in this iOS/Android binary (RNFBAppModule missing).'
      );
    }

    const rawNonce = await createNonce();
    const hashedNonce = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      rawNonce
    );

    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });

    if (!credential.identityToken) {
      throw new Error('Apple sign-in failed: missing identity token');
    }

    const auth = authModular.getAuth();
    const appleCredential = authModular.AppleAuthProvider.credential(
      credential.identityToken,
      rawNonce
    );
    await authModular.signInWithCredential(auth, appleCredential);

    const fullName = credential.fullName
      ? [credential.fullName.givenName, credential.fullName.familyName]
          .filter(Boolean)
          .join(' ')
      : null;

    return {
      idToken: credential.identityToken,
      nonce: rawNonce,
      profile: {
        email: credential.email,
        displayName: fullName,
        avatarUrl: null,
      },
    };
  },

  async signOut() {
    try {
      const authModular = getFirebaseAuthModular();
      if (authModular) {
        const auth = authModular.getAuth();
        await authModular.signOut(auth);
      }
    } catch (error) {}
    try {
      const googleSignin = getGoogleSignin();
      if (googleSignin?.GoogleSignin) {
        await googleSignin.GoogleSignin.signOut();
      }
    } catch (error) {}
  },
};
