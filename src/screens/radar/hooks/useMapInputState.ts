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

  const setDestinationInputFocused = useCallback((focused: boolean) => {
    setIsDestinationInputFocused(focused);
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
    // On Android, only force-focus if the input isn't already focused,
    // and defer slightly to avoid racing with the native focus sequence.
    if (Platform.OS === 'android' && !destinationInputRef.current?.isFocused()) {
      setTimeout(() => {
        destinationInputRef.current?.focus();
      }, 80);
    }
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
