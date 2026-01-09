import auth from '@react-native-firebase/auth';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';

const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_FIREBASE_WEB_CLIENT_ID;
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_FIREBASE_IOS_CLIENT_ID;

const createNonce = async (length: number = 32) => {
  const charset = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const bytes = await Crypto.getRandomBytesAsync(length);
  return Array.from(bytes)
    .map((b) => charset[b % charset.length])
    .join('');
};

export const FirebaseAuthService = {
  configureGoogle() {
    if (!GOOGLE_WEB_CLIENT_ID) {
      console.warn('Missing EXPO_PUBLIC_FIREBASE_WEB_CLIENT_ID for Google Sign-In.');
    }
    GoogleSignin.configure({
      webClientId: GOOGLE_WEB_CLIENT_ID,
      iosClientId: GOOGLE_IOS_CLIENT_ID,
    });
  },

  async signInWithGoogle() {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const { idToken, user } = await GoogleSignin.signIn();
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
      await auth().signOut();
    } catch (error) {}
    try {
      await GoogleSignin.signOut();
    } catch (error) {}
  },
};
