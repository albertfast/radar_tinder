# Radar Tinder App

A professional radar detection mobile application built with Expo React Native and TypeScript.

## Features

### Core Functionality
- **Real-time Radar Detection**: Detects nearby radar locations using GPS and device sensors
- **Interactive Maps**: View radar locations on an interactive map with your current position
- **Smart Alerts**: Receive notifications when approaching radar locations with severity-based alerts
- **Offline Support**: Full offline functionality with data synchronization when online

### User Management
- **User Authentication**: Secure login and registration system
- **Profile Management**: Complete user profile with statistics and settings
- **Subscription Plans**: Three-tier subscription system (Free, Premium, Pro)

### Radar Reporting
- **Community Reporting**: Users can report new radar locations
- **Location Verification**: Community-based verification system for reported radars
- **Radar Types**: Support for fixed cameras, mobile cameras, red light cameras, and speed cameras

### Advanced Features
- **Background Processing**: Continuous radar detection even when app is in background
- **Push Notifications**: Real-time alerts for nearby radar detections
- **Data Caching**: Intelligent caching for offline use and performance optimization
- **Location Services**: Advanced location tracking with distance calculations

## Technology Stack

### Frontend
- **React Native**: Cross-platform mobile development
- **Expo**: Development and build platform
- **TypeScript**: Type-safe JavaScript
- **React Navigation**: Navigation management
- **React Native Paper**: Material Design components
- **React Native Maps**: Interactive map functionality

### State Management
- **Zustand**: Lightweight state management
- **TanStack Query**: Server state management

### Services
- **Expo Location**: GPS and location services
- **Expo Notifications**: Push notifications
- **Expo SQLite**: Local database
- **Expo Secure Store**: Secure storage

### Backend Services
- **Location Service**: GPS tracking and distance calculations
- **Radar Service**: Radar location management and detection
- **Notification Service**: Push notification management
- **Database Service**: SQLite database operations
- **Offline Service**: Data synchronization and caching
- **Background Service**: Background task management

## App Structure

```
src/
├── components/          # Reusable UI components
├── navigation/         # Navigation configuration
├── screens/           # Main app screens
│   ├── LoginScreen.tsx
│   ├── RegisterScreen.tsx
│   ├── RadarScreen.tsx
│   ├── MapScreen.tsx
│   ├── AlertsScreen.tsx
│   ├── ProfileScreen.tsx
│   └── ReportRadarScreen.tsx
├── services/          # Business logic services
│   ├── LocationService.ts
│   ├── RadarService.ts
│   ├── NotificationService.ts
│   ├── DatabaseService.ts
│   ├── OfflineService.ts
│   └── BackgroundService.ts
├── store/             # State management
│   ├── authStore.ts
│   └── radarStore.ts
├── types/             # TypeScript type definitions
│   └── index.ts
├── utils/             # Utility functions
│   └── theme.ts
└── assets/            # App assets
```

## Installation

### Prerequisites
- Node.js (v16 or higher)
- pnpm (v8 or higher)
- Expo CLI
- iOS Simulator (for iOS development)
- Android Studio/Emulator (for Android development)

### Setup
1. Clone the repository
2. Install dependencies:
   ```bash
   pnpm install
   ```
3. Start the development server:
   ```bash
   pnpm start
   ```
4. Run on device/simulator:
   - iOS: `pnpm run ios`
   - Android: `pnpm run android`
   - Web: `pnpm run web`

## Building for iOS

For detailed iOS build instructions, including fixing Firebase build errors and GitHub Actions setup, see:
- 📖 [iOS Build Setup Guide (English)](./docs/IOS_BUILD_SETUP.md)
- 📖 [iOS Build Setup Guide (Türkçe)](./docs/IOS_BUILD_SETUP_TR.md)

### Quick Build Commands

**Using GitHub Actions** (Recommended):
- Push to `master` branch or manually trigger workflow in GitHub Actions tab

**Using EAS Build**:
```bash
# Build for testing
eas build --platform ios --profile adhoc

# Build for App Store
eas build --platform ios --profile production
```

**Encode Credentials for GitHub**:
```bash
./scripts/encode-credentials.sh
```

## Usage

### Getting Started
1. Create an account or login
2. Enable location services
3. Start radar detection
4. View nearby radars on the map
5. Receive alerts when approaching radar locations

### Reporting Radars
1. Tap the + button on the Radar screen
2. Select radar type
3. Add additional details (speed limit, direction, notes)
4. Submit report

### Managing Alerts
- View active alerts in the Alerts tab
- Acknowledge alerts to dismiss them
- View alert history
- Configure notification settings

## Subscription Plans

### Free
- 5km detection range
- Basic alerts
- Community data
- Limited offline functionality

### Premium ($9.99/month)
- 10km detection range
- Advanced alerts
- Real-time updates
- Ad-free experience
- Full offline support

### Pro ($19.99/month)
- Unlimited detection range
- Priority alerts
- All premium features
- 24/7 support
- Maximum offline capabilities

## Data Privacy

- Location data is processed locally on device
- User data is encrypted and securely stored
- Anonymous reporting options available
- GDPR compliant data handling

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

For support and questions, please create an issue in the repository or contact our support team.

---

**Note**: This app is intended for educational and informational purposes. Users must comply with local laws and regulations regarding radar detection devices.
