import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import TrialOfferScreen from '../screens/TrialOfferScreen';
import AdminLoginScreen from '../screens/AdminLoginScreen';
import TermsScreen from '../screens/TermsScreen';
import PrivacyScreen from '../screens/PrivacyScreen';

export type AuthStackParamList = {
  TrialOffer: undefined;
  AdminLogin?: undefined;
  Terms: undefined;
  Privacy: undefined;
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
      <Stack.Screen name="Terms" component={TermsScreen} />
      <Stack.Screen name="Privacy" component={PrivacyScreen} />
      <Stack.Screen name="AdminLogin" component={AdminLoginScreen} />
    </Stack.Navigator>
  );
};

export default AuthNavigator;
