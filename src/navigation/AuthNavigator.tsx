import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import TrialOfferScreen from '../screens/TrialOfferScreen';

export type AuthStackParamList = {
  TrialOffer: undefined;
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
    </Stack.Navigator>
  );
};

export default AuthNavigator;
