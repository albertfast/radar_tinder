export const TAB_BAR_HEIGHT = 86;

// Responsive utility functions
import { Dimensions } from 'react-native';

const { width: screenWidth } = Dimensions.get('window');
const BASE_WIDTH = 375; // iPhone 6/7/8 width

/**
 * Get responsive padding based on screen width
 * @param value Base padding value
 * @returns Responsive padding value
 */
export const getResponsivePadding = (value: number): number => {
  const scale = Math.min(screenWidth / BASE_WIDTH, 1.15);
  return Math.round(value * scale);
};

/**
 * Get responsive font size based on screen width
 * @param value Base font size value
 * @returns Responsive font size value
 */
export const getResponsiveFontSize = (value: number): number => {
  const scale = Math.min(screenWidth / BASE_WIDTH, 1.15);
  return Math.round(value * scale);
};

/**
 * Get responsive margin based on screen width
 * @param value Base margin value
 * @returns Responsive margin value
 */
export const getResponsiveMargin = (value: number): number => {
  const scale = Math.min(screenWidth / BASE_WIDTH, 1.15);
  return Math.round(value * scale);
};

/**
 * Get responsive width based on screen width
 * @param value Base width value
 * @returns Responsive width value
 */
export const getResponsiveWidth = (value: number): number => {
  const scale = Math.min(screenWidth / BASE_WIDTH, 1.15);
  return Math.round(value * scale);
};

/**
 * Get responsive height based on screen width
 * @param value Base height value
 * @returns Responsive height value
 */
export const getResponsiveHeight = (value: number): number => {
  const scale = Math.min(screenWidth / BASE_WIDTH, 1.15);
  return Math.round(value * scale);
};

/**
 * Check if device is tablet
 * @returns boolean
 */
export const isTablet = (): boolean => {
  return screenWidth >= 768;
};

/**
 * Get UI scale factor
 * @returns number
 */
export const getUIScale = (): number => {
  return Math.min(screenWidth / BASE_WIDTH, 1.15);
};
