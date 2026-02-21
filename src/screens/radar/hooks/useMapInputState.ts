import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, TextInput } from 'react-native';

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
  const [isBlurSettling, setIsBlurSettling] = useState(false);

  const destinationInputRef = useRef<TextInput>(null);
  const lastDestinationFocusAtRef = useRef(0);
  const isTypingRef = useRef(false);
  const isDestinationInputFocusedRef = useRef(false);
  const blurFinalizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setDestinationInputFocused = useCallback((focused: boolean) => {
    isDestinationInputFocusedRef.current = focused;
    setIsDestinationInputFocused(focused);
  }, []);

  const handleInputFocus = useCallback(
    ({ isDestinationEmpty, hasRecentDestinations, onShowRecent, onBeginInteracting }: FocusParams) => {
      if (blurFinalizeTimeoutRef.current) {
        clearTimeout(blurFinalizeTimeoutRef.current);
        blurFinalizeTimeoutRef.current = null;
      }
      if (keyboardTraceEnabled) {
        console.log('[KeyboardTrace] inputFocus');
      }
      lastDestinationFocusAtRef.current = Date.now();
      setDestinationInputFocused(true);
      setIsBlurSettling(false);
      isTypingRef.current = true;
      onBeginInteracting?.();

      if (isDestinationEmpty && hasRecentDestinations) {
        onShowRecent?.();
      }
    },
    [keyboardTraceEnabled, setDestinationInputFocused]
  );

  const handleInputPressIn = useCallback(() => {
    if (blurFinalizeTimeoutRef.current) {
      clearTimeout(blurFinalizeTimeoutRef.current);
      blurFinalizeTimeoutRef.current = null;
    }
    lastDestinationFocusAtRef.current = Date.now();
  }, []);

  const handleInputBlur = useCallback(
    (onBlurFinalize?: () => void) => {
      if (keyboardTraceEnabled) {
        console.log('[KeyboardTrace] inputBlur');
      }
      setDestinationInputFocused(false);
      setIsBlurSettling(true);
      isTypingRef.current = false;
      if (blurFinalizeTimeoutRef.current) {
        clearTimeout(blurFinalizeTimeoutRef.current);
      }
      blurFinalizeTimeoutRef.current = setTimeout(() => {
        setIsBlurSettling(false);
        onBlurFinalize?.();
        blurFinalizeTimeoutRef.current = null;
      }, 220);
    },
    [keyboardTraceEnabled, setDestinationInputFocused]
  );

  const dismissDestinationInput = useCallback(
    (onDismissFinalize?: () => void) => {
      if (destinationInputRef.current?.isFocused()) {
        destinationInputRef.current.blur();
      }
      if (blurFinalizeTimeoutRef.current) {
        clearTimeout(blurFinalizeTimeoutRef.current);
        blurFinalizeTimeoutRef.current = null;
      }
      setDestinationInputFocused(false);
      setIsBlurSettling(false);
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
      if (!isDestinationInputFocusedRef.current) {
        setIsBlurSettling(false);
      }
      if (keyboardTraceEnabled) {
        console.log('[KeyboardTrace] didHide');
      }
    });

    return () => {
      showSub.remove();
      hideSub.remove();
      if (blurFinalizeTimeoutRef.current) {
        clearTimeout(blurFinalizeTimeoutRef.current);
      }
    };
  }, [keyboardTraceEnabled]);

  return {
    isDestinationInputFocused,
    isKeyboardVisible,
    isMapInputLockActive: isDestinationInputFocused || isBlurSettling,
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
