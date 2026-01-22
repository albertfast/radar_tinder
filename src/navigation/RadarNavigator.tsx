import React, { useEffect } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import RadarScreen from '../screens/RadarScreen';
import RadarSettingsScreen from '../screens/RadarSettingsScreen';
import AIDiagnoseScreen from '../screens/AIDiagnoseScreen';
import SubscriptionScreen from '../screens/SubscriptionScreen';
import PermitTestScreen from '../screens/PermitTestScreen';
import HistoryScreen from '../screens/HistoryScreen';
import ProfileScreen from '../screens/ProfileScreen';
import LeaderboardScreen from '../screens/LeaderboardScreen';
import ComponentsShowcaseScreen from '../screens/ComponentsShowcaseScreen';

const Stack = createNativeStackNavigator();

const RadarNavigator = ({ route, navigation }: any) => {
  const initialParams = route?.params;

  // Handle navigation to nested screens from drawer menu
  useEffect(() => {
    if (initialParams?.screen && initialParams.screen !== 'RadarMain') {
      navigation.navigate(initialParams.screen);
    }
  }, [initialParams?.screen, navigation]);

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="RadarMain" component={RadarScreen} initialParams={initialParams} />
      <Stack.Screen name="RadarSettings" component={RadarSettingsScreen} />
      <Stack.Screen name="AIDiagnose" component={AIDiagnoseScreen} />
      <Stack.Screen name="PermitTest" component={PermitTestScreen} />
      <Stack.Screen name="History" component={HistoryScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="Leaderboard" component={LeaderboardScreen} />
      <Stack.Screen name="Settings" component={RadarSettingsScreen} />
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
