import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import TrialOfferScreen from '../screens/TrialOfferScreen';
import AdminLoginScreen from '../screens/AdminLoginScreen';

export type AuthStackParamList = {
  TrialOffer: undefined;
  AdminLogin?: undefined;
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

const AuthNavigator = () => {
  return (
    <Stack.Navigator
      initialRouteName="TrialOffer"
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="TrialOffer" component={TrialOfferScreen} />
      <Stack.Screen name="AdminLogin" component={AdminLoginScreen} />
    </Stack.Navigator>
  );
};

export default AuthNavigator;
