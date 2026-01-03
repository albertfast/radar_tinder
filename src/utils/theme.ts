import { DefaultTheme, MD3DarkTheme, MD3LightTheme } from 'react-native-paper';

export const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#FF6B35',
    secondary: '#4ECDC4',
    background: '#F8F9FA',
    surface: '#FFFFFF',
    text: '#2D3436',
    error: '#E74C3C',
    success: '#27AE60',
    warning: '#F39C12',
    info: '#3498DB',
    outline: '#B2BEC3',
  },
  roundness: 12,
  animation: {
    scale: 1.0,
  },
};

export const darkTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#FF6B35',
    secondary: '#4ECDC4',
    background: '#121212',
    surface: '#1E1E1E',
    text: '#F8F9FA',
    error: '#E74C3C',
    success: '#27AE60',
    warning: '#F39C12',
    info: '#3498DB',
    outline: '#636E72',
  },
  roundness: 12,
  animation: {
    scale: 1.0,
  },
};
