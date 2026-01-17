import React from 'react';
import Animated, { 
  FadeInDown, 
  SlideInRight, 
  FadeInUp,
  ZoomIn,
  BounceInDown,
  BounceInUp,
} from 'react-native-reanimated';
import { ANIMATION_TIMING } from '../utils/animationConstants';

interface ScreenTransitionProps {
  children: React.ReactNode;
  type?: 'fade' | 'slide' | 'bounce' | 'zoom' | 'slideUp';
  delay?: number;
}

export const ScreenTransition: React.FC<ScreenTransitionProps> = ({ 
  children, 
  type = 'fade',
  delay = 0,
}) => {
  const getAnimation = () => {
    switch (type) {
      case 'slide':
        return SlideInRight.duration(ANIMATION_TIMING.SLOW);
      case 'bounce':
        return BounceInDown.duration(ANIMATION_TIMING.SLOW).delay(delay);
      case 'zoom':
        return ZoomIn.duration(ANIMATION_TIMING.BASE).delay(delay);
      case 'slideUp':
        return BounceInUp.duration(ANIMATION_TIMING.SLOW).delay(delay);
      default:
        return FadeInDown.duration(ANIMATION_TIMING.BASE).delay(delay);
    }
  };

  return (
    <Animated.View
      style={{ flex: 1 }}
      entering={getAnimation()}
    >
      {children}
    </Animated.View>
  );
};

export default ScreenTransition;
