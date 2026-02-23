import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ProfileScreen from '../screens/ProfileScreen';
import LeaderboardScreen from '../screens/LeaderboardScreen';
import TermsScreen from '../screens/TermsScreen';
import PrivacyScreen from '../screens/PrivacyScreen';
import SubscriptionScreen from '../screens/SubscriptionScreen';
import ComponentsShowcaseScreen from '../screens/ComponentsShowcaseScreen';
import RadarSettingsScreen from '../screens/RadarSettingsScreen';
import AdminLoginScreen from '../screens/AdminLoginScreen';

const Stack = createNativeStackNavigator();

const ProfileNavigator = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ProfileMain" component={ProfileScreen} />
      <Stack.Screen name="Leaderboard" component={LeaderboardScreen} />
      <Stack.Screen name="Settings" component={RadarSettingsScreen} />
      <Stack.Screen name="Terms" component={TermsScreen} />
      <Stack.Screen name="Privacy" component={PrivacyScreen} />
      <Stack.Screen name="ComponentsShowcase" component={ComponentsShowcaseScreen} />
      <Stack.Screen name="AdminLogin" component={AdminLoginScreen} />
      <Stack.Screen 
        name="Subscription" 
        component={SubscriptionScreen} 
        options={{ presentation: 'modal' }}
      />
    </Stack.Navigator>
  );
};

export default ProfileNavigator;
