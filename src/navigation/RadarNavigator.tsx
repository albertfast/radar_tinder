import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import RadarScreen from '../screens/RadarScreen';
import RadarSettingsScreen from '../screens/RadarSettingsScreen';
import AIDiagnoseScreen from '../screens/AIDiagnoseScreen';
import SubscriptionScreen from '../screens/SubscriptionScreen';
import PermitTestScreen from '../screens/PermitTestScreen';
import HistoryScreen from '../screens/HistoryScreen';
import AlertsScreen from '../screens/AlertsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import ComponentsShowcaseScreen from '../screens/ComponentsShowcaseScreen';

const Stack = createNativeStackNavigator();

const RadarNavigator = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="RadarMain" component={RadarScreen} />
      <Stack.Screen name="RadarSettings" component={RadarSettingsScreen} />
      <Stack.Screen name="AIDiagnose" component={AIDiagnoseScreen} />
      <Stack.Screen name="PermitTest" component={PermitTestScreen} />
      <Stack.Screen name="History" component={HistoryScreen} />
      <Stack.Screen name="Alerts" component={AlertsScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen 
        name="Subscription" 
        component={SubscriptionScreen} 
        options={{ presentation: 'modal', headerShown: false }}
      />
      <Stack.Screen name="ComponentsShowcase" component={ComponentsShowcaseScreen} />
    </Stack.Navigator>
  );
};

export default RadarNavigator;