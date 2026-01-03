import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, IconButton } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';

const TermsScreen = ({ navigation }: any) => {
  return (
    <View style={styles.container}>
      <LinearGradient colors={['#000000', '#121212']} style={styles.background} />
      
      <View style={styles.header}>
        <IconButton icon="chevron-left" iconColor="white" size={30} onPress={() => navigation.goBack()} />
        <Text style={styles.headerTitle}>Terms of Service</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.text}>
          <Text style={styles.bold}>Last Updated: December 21, 2025</Text>{"\n\n"}
          
          Welcome to Radar Tinder. By accessing or using our mobile application, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our services.{"\n\n"}

          <Text style={styles.bold}>1. Use of Service</Text>{"\n"}
          Radar Tinder provides real-time radar detection and navigation assistance. You agree to use the application responsibly and in compliance with all local traffic laws and regulations. The Amasaki Team is not responsible for any traffic violations or accidents that may occur while using the app.{"\n\n"}

          <Text style={styles.bold}>2. User Accounts</Text>{"\n"}
          To access certain features, you may be required to create an account. You are responsible for maintaining the confidentiality of your account information and for all activities that occur under your account.{"\n\n"}

          <Text style={styles.bold}>3. Premium Subscriptions</Text>{"\n"}
          We offer premium features under "PRO" subscriptions. Subscriptions are billed on a recurring basis. You may cancel your subscription at any time through your account settings.{"\n\n"}

          <Text style={styles.bold}>4. Intellectual Property</Text>{"\n"}
          All content, features, and functionality of the app are owned by the Amasaki Team and are protected by international copyright, trademark, and other intellectual property laws.{"\n\n"}

          <Text style={styles.bold}>5. Disclaimer</Text>{"\n"}
          The application is provided "as is" without warranties of any kind. We do not guarantee the accuracy of radar locations or navigation data.{"\n\n"}

          <Text style={styles.bold}>6. Contact Us</Text>{"\n"}
          If you have any questions about these Terms, please contact the Amasaki Team at support@amasaki.com.
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

export default TermsScreen;
