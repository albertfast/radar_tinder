import { useEffect, useRef } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { Keyboard, Platform } from 'react-native';
import { useUiStore } from '../store/uiStore';

const SCROLL_THRESHOLD = 12;
const SCROLL_HIDE_REASON = 'scroll_hide';
const KEYBOARD_HIDE_REASON = 'keyboard_hide';

export const useAutoHideTabBar = () => {
  const hideTabBar = useUiStore((state) => state.hideTabBar);
  const showTabBar = useUiStore((state) => state.showTabBar);
  const lastOffsetRef = useRef(0);
  const isDraggingRef = useRef(false);
  const isKeyboardShownRef = useRef(false);

  useEffect(() => {
    // Reset tab bar visibility on unmount
    return () => {
      showTabBar(SCROLL_HIDE_REASON);
      showTabBar(KEYBOARD_HIDE_REASON);
    };
  }, [showTabBar]);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => {
        isKeyboardShownRef.current = true;
        hideTabBar(KEYBOARD_HIDE_REASON);
      }
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        isKeyboardShownRef.current = false;
        showTabBar(KEYBOARD_HIDE_REASON);
      }
    );

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [hideTabBar, showTabBar]);

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    // Ignore scroll events if the user is not dragging (e.g. system resize due to keyboard)
    // or if the keyboard is already shown (we don't want to toggle tabs while typing)
    if (!isDraggingRef.current || isKeyboardShownRef.current) return;

    const offsetY = Math.max(0, event.nativeEvent.contentOffset.y);
    const diff = offsetY - lastOffsetRef.current;

    if (Math.abs(diff) < SCROLL_THRESHOLD) return;

    if (diff > 0) {
      hideTabBar(SCROLL_HIDE_REASON);
    } else {
      showTabBar(SCROLL_HIDE_REASON);
    }

    lastOffsetRef.current = offsetY;
  };

  const onScrollBeginDrag = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    isDraggingRef.current = true;
    lastOffsetRef.current = Math.max(0, event.nativeEvent.contentOffset.y);
  };

  const onScrollEndDrag = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    isDraggingRef.current = false;
    const offsetY = Math.max(0, event.nativeEvent.contentOffset.y);
    // If we are at the very top, always show the tab bar
    if (offsetY <= 0) {
      showTabBar(SCROLL_HIDE_REASON);
    }
  };

  return {
    onScroll,
    onScrollBeginDrag,
    onScrollEndDrag,
  };
};
