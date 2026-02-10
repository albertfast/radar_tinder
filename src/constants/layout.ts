export const TAB_BAR_HEIGHT = 86;

// Responsive utility functions
import { Dimensions } from 'react-native';

const BASE_WIDTH = 375; // iPhone 6/7/8 width

function getScale(): number {
  const { width } = Dimensions.get('window');
  return Math.min(width / BASE_WIDTH, 1.15);
}

/**
 * Get responsive padding based on screen width
 * @param value Base padding value
 * @returns Responsive padding value
 */
export function getResponsivePadding(value: number): number {
  return Math.round(value * getScale());
}

/**
 * Get responsive font size based on screen width
 * @param value Base font size value
 * @returns Responsive font size value
 */
export function getResponsiveFontSize(value: number): number {
  return Math.round(value * getScale());
}

/**
 * Get responsive margin based on screen width
 * @param value Base margin value
 * @returns Responsive margin value
 */
export function getResponsiveMargin(value: number): number {
  return Math.round(value * getScale());
}

/**
 * Get responsive width based on screen width
 * @param value Base width value
 * @returns Responsive width value
 */
export function getResponsiveWidth(value: number): number {
  return Math.round(value * getScale());
}

/**
 * Get responsive height based on screen width
 * @param value Base height value
 * @returns Responsive height value
 */
export function getResponsiveHeight(value: number): number {
  return Math.round(value * getScale());
}

/**
 * Check if device is tablet
 * @returns boolean
 */
export function isTablet(): boolean {
  const { width } = Dimensions.get('window');
  return width >= 768;
}

/**
 * Get UI scale factor
 * @returns number
 */
export function getUIScale(): number {
  return getScale();
}
