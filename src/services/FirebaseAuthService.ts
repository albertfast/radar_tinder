import { NativeModules } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';

const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_FIREBASE_WEB_CLIENT_ID;
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_FIREBASE_IOS_CLIENT_ID;

let cachedFirebaseAuth: any | undefined;
function getFirebaseAuth(): any | null {
  if (cachedFirebaseAuth !== undefined) return cachedFirebaseAuth;

  // If the Firebase App native module isn't present in this binary (Expo Go / outdated dev client),
  // do not require the JS package (it will throw immediately).
  if (!NativeModules?.RNFBAppModule) {
    cachedFirebaseAuth = null;
    return cachedFirebaseAuth;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@react-native-firebase/auth');
    cachedFirebaseAuth = mod?.default ?? mod;
  } catch (error) {
    cachedFirebaseAuth = null;
  }

  return cachedFirebaseAuth;
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
    const auth = getFirebaseAuth();
    if (!auth) {
      throw new Error(
        'Firebase Auth is not available in this iOS/Android binary (RNFBAppModule missing).'
      );
    }

    if (auth().currentUser) {
      return { uid: auth().currentUser!.uid };
    }

    const result = await auth().signInAnonymously();
    if (!result.user) {
      throw new Error('Anonymous sign-in failed: missing user');
    }
    return { uid: result.user.uid };
  },

  async signInWithGoogle() {
    const auth = getFirebaseAuth();
    if (!auth) {
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

    const credential = auth.GoogleAuthProvider.credential(idToken);
    await auth().signInWithCredential(credential);

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
    const auth = getFirebaseAuth();
    if (!auth) {
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

    const appleCredential = auth.AppleAuthProvider.credential(
      credential.identityToken,
      rawNonce
    );
    await auth().signInWithCredential(appleCredential);

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
      const auth = getFirebaseAuth();
      if (auth) {
        await auth().signOut();
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
