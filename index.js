import 'react-native-url-polyfill/auto';
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

// In case app.json structure is { "expo": { "name": ... } } or similar, we fallback or parse carefully.
// Standard RN expects app.json to have { "name": "appName" } at top level usually, 
// but Expo app.json has a different structure. 
// We will hardcode the name found in MainApplication/app.json to be safe, or just use string.
// app.json in this project has "expo": { "name": "Radar Tinder", "slug": "radar-tinder" ... }
// The native code usually expects "main" or the simple name.
// Let's use the explicit name 'main' or the one defined in native (usually "main" is default if not specified, 
// but MainApplication.kt might have getMainComponentName).

// Checking MainApplication.kt... it usually defaults to "RadarTinder" or similar based on project setup.
// Wait, MainApplication.kt doesn't explicitly override getMainComponentName() in the snippet I saw.
// Standard ReactActivityDelegate usually looks for the return of getMainComponentName().
// I should verify MainActivity.kt to see what it returns.

// For now, I'll write a temporary index.js and then verify MainActivity.kt to match the name.
// Standard Expo "bare" setup often uses "main".

AppRegistry.registerComponent('main', () => App);
