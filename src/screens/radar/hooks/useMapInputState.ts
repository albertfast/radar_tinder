import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, TextInput } from 'react-native';

type FocusParams = {
  isDestinationEmpty: boolean;
  hasRecentDestinations: boolean;
  onShowRecent?: () => void;
  onBeginInteracting?: () => void;
};

type UseMapInputStateParams = {
  keyboardTraceEnabled: boolean;
};

export function useMapInputState({ keyboardTraceEnabled }: UseMapInputStateParams) {
  const [isDestinationInputFocused, setIsDestinationInputFocused] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  const destinationInputRef = useRef<TextInput>(null);
  const lastDestinationFocusAtRef = useRef(0);
  const isTypingRef = useRef(false);
  const didAttemptAndroidRefocusRef = useRef(false);

  const setDestinationInputFocused = useCallback((focused: boolean) => {
    setIsDestinationInputFocused(focused);
    if (!focused) {
      didAttemptAndroidRefocusRef.current = false;
    }
  }, []);

  const handleInputFocus = useCallback(
    ({ isDestinationEmpty, hasRecentDestinations, onShowRecent, onBeginInteracting }: FocusParams) => {
      if (keyboardTraceEnabled) {
        console.log('[KeyboardTrace] inputFocus');
      }
      lastDestinationFocusAtRef.current = Date.now();
      setDestinationInputFocused(true);
      isTypingRef.current = true;
      onBeginInteracting?.();

      if (isDestinationEmpty && hasRecentDestinations) {
        onShowRecent?.();
      }
    },
    [keyboardTraceEnabled, setDestinationInputFocused]
  );

  const handleInputPressIn = useCallback(() => {
    lastDestinationFocusAtRef.current = Date.now();
    setDestinationInputFocused(true);
    isTypingRef.current = true;
    if (keyboardTraceEnabled) {
      console.log('[KeyboardTrace] inputPressIn');
    }
    // Force an explicit focus request on Android to avoid "tap-without-keyboard".
    destinationInputRef.current?.focus();
  }, [keyboardTraceEnabled, setDestinationInputFocused]);

  const handleInputBlur = useCallback(
    (onBlurFinalize?: () => void) => {
      if (keyboardTraceEnabled) {
        console.log('[KeyboardTrace] inputBlur');
      }
      setDestinationInputFocused(false);
      isTypingRef.current = false;
      setTimeout(() => {
        onBlurFinalize?.();
      }, 120);
    },
    [keyboardTraceEnabled, setDestinationInputFocused]
  );

  const dismissDestinationInput = useCallback(
    (onDismissFinalize?: () => void) => {
      if (destinationInputRef.current?.isFocused()) {
        destinationInputRef.current.blur();
      }
      setDestinationInputFocused(false);
      isTypingRef.current = false;
      Keyboard.dismiss();
      onDismissFinalize?.();
    },
    [setDestinationInputFocused]
  );

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (event) => {
      setIsKeyboardVisible(true);
      didAttemptAndroidRefocusRef.current = false;
      if (keyboardTraceEnabled) {
        console.log('[KeyboardTrace] didShow', {
          height: event.endCoordinates?.height,
        });
      }
    });

    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setIsKeyboardVisible(false);
      if (keyboardTraceEnabled) {
        console.log('[KeyboardTrace] didHide');
      }
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [keyboardTraceEnabled]);

  // Android-only fallback: try one refocus if focused without keyboard.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    if (!isDestinationInputFocused || isKeyboardVisible) return;
    if (didAttemptAndroidRefocusRef.current) return;

    didAttemptAndroidRefocusRef.current = true;
    const timeout = setTimeout(() => {
      const input = destinationInputRef.current;
      if (!input?.isFocused()) return;
      if (keyboardTraceEnabled) {
        console.log('[KeyboardTrace] refocusSoftInput');
      }
      Keyboard.dismiss();
      setTimeout(() => {
        input.focus();
      }, 48);
    }, 220);

    return () => clearTimeout(timeout);
  }, [isDestinationInputFocused, isKeyboardVisible, keyboardTraceEnabled]);

  return {
    isDestinationInputFocused,
    isKeyboardVisible,
    isMapInputLockActive: isDestinationInputFocused || isKeyboardVisible,
    destinationInputRef,
    lastDestinationFocusAtRef,
    isTypingRef,
    setDestinationInputFocused,
    handleInputPressIn,
    handleInputFocus,
    handleInputBlur,
    dismissDestinationInput,
  };
}
