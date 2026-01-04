# App Assets

This directory contains all the visual assets for the Radar Tinder app.

## Required Assets

### Icons

- `icon.png` - App icon (1024x1024px)
- `adaptive-icon.png` - Adaptive icon for Android (1024x1024px)
- `favicon.png` - Web favicon (32x32px)

### Splash Screens

- `splash.png` - App splash screen (1242x2436px for iPhone X/11/12)

### Screenshots

- `screenshot-1.png` - App store screenshot (1242x2688px)
- `screenshot-2.png` - App store screenshot (1242x2688px)
- `screenshot-3.png` - App store screenshot (1242x2688px)

## Asset Guidelines

### App Icon

- Size: 1024x1024 pixels
- Format: PNG
- Background: Transparent or solid color
- Design: Simple, recognizable, and scalable
- Should work well at small sizes

### Adaptive Icon (Android)

- Size: 1024x1024 pixels
- Format: PNG
- Background: Separate layer for background and foreground
- Design: Should work with different background shapes

### Splash Screen

- Size: 1242x2436 pixels (iPhone X/11/12 dimensions)
- Format: PNG
- Design: Clean, minimal, with app logo and name
- Should look good on different screen sizes

### Screenshots

- Size: 1242x2688 pixels (iPhone X/11/12 dimensions)
- Format: PNG
- Content: Show app features and UI
- Should demonstrate key functionality

## Color Scheme

### Primary Colors

- Primary: #FF6B35 (Orange)
- Secondary: #4ECDC4 (Teal)
- Background: #F8F9FA (Light Gray)
- Surface: #FFFFFF (White)
- Text: #2D3436 (Dark Gray)

### Status Colors

- Success: #27AE60 (Green)
- Warning: #F39C12 (Yellow)
- Error: #E74C3C (Red)
- Info: #3498DB (Blue)

## Typography

### Font Family

- Primary: System Font (San Francisco for iOS, Roboto for Android)
- Secondary: System Font

### Font Sizes

- Large: 28px (Headings)
- Medium: 18px (Subheadings)
- Regular: 16px (Body text)
- Small: 14px (Captions)
- Extra Small: 12px (Fine print)

## Asset Generation

To generate assets, you can use the following tools:

### Expo Asset Tools

```bash
npx expo-optimize
```

### Custom Scripts

```bash
# Generate icons
npx pwa-asset-generator ./assets/splash.png ./assets/icons

# Generate splash screens
npx react-native-make-splash
```

## Asset Optimization

### Image Optimization

- Use PNG for icons and graphics with transparency
- Use JPG for photos and complex images
- Compress images to reduce file size
- Use appropriate resolution for different devices

### Performance Considerations

- Keep asset file sizes small
- Use vector formats where possible
- Lazy load non-critical assets
- Use CDN for asset delivery

## Legal Requirements

### App Store Guidelines

- Follow Apple's Human Interface Guidelines
- Follow Google's Material Design Guidelines
- Ensure all assets are original or properly licensed
- Include necessary privacy policy and terms of service

### Accessibility

- Provide alternative text for images
- Ensure sufficient color contrast
- Support dynamic type sizing
- Test with accessibility tools
