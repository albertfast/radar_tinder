import { useEffect, useRef } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useUiStore } from '../store/uiStore';

const SCROLL_THRESHOLD = 12;

export const useAutoHideTabBar = () => {
  const setTabBarHidden = useUiStore((state) => state.setTabBarHidden);
  const lastOffsetRef = useRef(0);

  useEffect(() => {
    return () => {
      setTabBarHidden(false);
    };
  }, [setTabBarHidden]);

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = Math.max(0, event.nativeEvent.contentOffset.y);
    const diff = offsetY - lastOffsetRef.current;

    if (Math.abs(diff) < SCROLL_THRESHOLD) return;

    if (diff > 0) {
      setTabBarHidden(true);
    } else {
      setTabBarHidden(false);
    }

    lastOffsetRef.current = offsetY;
  };

  const onScrollBeginDrag = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    lastOffsetRef.current = Math.max(0, event.nativeEvent.contentOffset.y);
  };

  const onScrollEndDrag = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = Math.max(0, event.nativeEvent.contentOffset.y);
    if (offsetY <= 0) {
      setTabBarHidden(false);
    }
  };

  return {
    onScroll,
    onScrollBeginDrag,
    onScrollEndDrag,
  };
};
