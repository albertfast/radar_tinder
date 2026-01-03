import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, IconButton } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';

const PrivacyScreen = ({ navigation }: any) => {
  return (
    <View style={styles.container}>
      <LinearGradient colors={['#000000', '#121212']} style={styles.background} />
      
      <View style={styles.header}>
        <IconButton icon="chevron-left" iconColor="white" size={30} onPress={() => navigation.goBack()} />
        <Text style={styles.headerTitle}>Privacy Policy</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.text}>
          <Text style={styles.bold}>Last Updated: December 21, 2025</Text>{"\n\n"}
          
          The Amasaki Team respects your privacy and is committed to protecting your personal data. This Privacy Policy explains how we collect, use, and share information about you when you use Radar Tinder.{"\n\n"}

          <Text style={styles.bold}>1. Information We Collect</Text>{"\n"}
          - <Text style={styles.bold}>Location Data:</Text> We collect precise location data to provide navigation and radar detection services.{"\n"}
          - <Text style={styles.bold}>User Data:</Text> We collect information you provide, such as your name, email, and vehicle details.{"\n"}
          - <Text style={styles.bold}>Usage Data:</Text> We collect data on how you interact with the app to improve our services.{"\n\n"}

          <Text style={styles.bold}>2. How We Use Your Information</Text>{"\n"}
          We use your information to:{"\n"}
          - Provide and improve our services.{"\n"}
          - Personalize your experience.{"\n"}
          - Process payments for premium subscriptions.{"\n"}
          - Communicate with you about updates and offers.{"\n\n"}

          <Text style={styles.bold}>3. Data Sharing</Text>{"\n"}
          We do not sell your personal data. We may share data with third-party service providers who assist us in operating our app, conducting our business, or serving our users.{"\n\n"}

          <Text style={styles.bold}>4. Data Security</Text>{"\n"}
          We implement appropriate security measures to protect your personal information. However, no method of transmission over the Internet is 100% secure.{"\n\n"}

          <Text style={styles.bold}>5. Contact Us</Text>{"\n"}
          If you have any questions about this Privacy Policy, please contact the Amasaki Team at privacy@amasaki.com.
        </Text>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000', paddingTop: 50 },
  background: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, marginBottom: 20 },
  headerTitle: { color: 'white', fontSize: 22, fontWeight: 'bold' },
  content: { paddingHorizontal: 20, paddingBottom: 40 },
  text: { color: '#CCCCCC', fontSize: 16, lineHeight: 24 },
  bold: { fontWeight: 'bold', color: 'white' },
});

export default PrivacyScreen;
