import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, IconButton } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { useAutoHideTabBar } from '../hooks/use-auto-hide-tab-bar';
import { TAB_BAR_HEIGHT } from '../constants/layout';
import {
  APP_DEVELOPER_NAME,
  APP_DISPLAY_NAME,
  APP_SUPPORT_EMAIL,
  APP_TERMS_URL,
} from '../config/appIdentity';

const TermsScreen = ({ navigation }: any) => {
  const { onScroll, onScrollBeginDrag, onScrollEndDrag } = useAutoHideTabBar();
  return (
    <View style={styles.container}>
      <LinearGradient colors={['#000000', '#121212']} style={styles.background} />
      
      <View style={styles.header}>
        <IconButton icon="chevron-left" iconColor="white" size={30} onPress={() => navigation.goBack()} />
        <Text style={styles.headerTitle}>Terms & Conditions</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: TAB_BAR_HEIGHT + 24 }]}
        onScroll={onScroll}
        onScrollBeginDrag={onScrollBeginDrag}
        onScrollEndDrag={onScrollEndDrag}
        scrollEventThrottle={16}
      >
        <Text style={styles.text}>
          <Text style={styles.bold}>Effective Date: April 2026</Text>{"\n\n"}

          These Terms and Conditions govern the use of mobile applications published by <Text style={styles.bold}>{APP_DEVELOPER_NAME}</Text>, including {APP_DISPLAY_NAME}. By downloading or using the app, you agree to these Terms.{"\n\n"}

          <Text style={styles.bold}>1. Use of the Application</Text>{"\n"}
          You must use the app only for lawful purposes and in accordance with applicable traffic and safety laws. You remain solely responsible for your driving decisions, route choices, and conduct while using {APP_DISPLAY_NAME}.{"\n\n"}

          <Text style={styles.bold}>2. Navigation and Detection Disclaimer</Text>{"\n"}
          Radar, map, route, community, and AI-assisted outputs are informational only and may be delayed, unavailable, or inaccurate. They are not guaranteed real-time official enforcement data and must not be relied on as the sole basis for driving decisions.{"\n\n"}

          <Text style={styles.bold}>3. Accounts</Text>{"\n"}
          Some features require an account. You are responsible for account confidentiality and all activity under your account.{"\n\n"}

          <Text style={styles.bold}>4. Subscriptions and Payments</Text>{"\n"}
          Premium features may require paid subscriptions. Billing, renewals, cancellations, and refunds are managed by your app store provider and subject to its terms. Subscription details shown in-app form part of the offer presented to you at the time of purchase.{"\n\n"}

          <Text style={styles.bold}>5. Intellectual Property</Text>{"\n"}
          App content, code, and functionality are owned by {APP_DEVELOPER_NAME} and protected by intellectual property laws. Unauthorized copying, reverse engineering, resale, or redistribution is prohibited unless permitted by law.{"\n\n"}

          <Text style={styles.bold}>6. Warranty Disclaimer</Text>{"\n"}
          The app is provided "as is" and "as available" without warranties of any kind, express or implied, including fitness for a particular purpose, availability, and accuracy.{"\n\n"}

          <Text style={styles.bold}>7. Limitation of Liability</Text>{"\n"}
          To the maximum extent permitted by law, {APP_DEVELOPER_NAME} is not liable for indirect, incidental, special, consequential, or punitive damages, including traffic penalties, accidents, loss of data, or loss of profits arising from use of the app.{"\n\n"}

          <Text style={styles.bold}>8. Indemnification</Text>{"\n"}
          You agree to defend and hold harmless {APP_DEVELOPER_NAME} from claims, liabilities, damages, and costs arising out of your misuse of the app or violation of these Terms.{"\n\n"}

          <Text style={styles.bold}>9. Termination</Text>{"\n"}
          We may suspend or terminate access if these Terms are violated or if required for security, legal, or operational reasons.{"\n\n"}

          <Text style={styles.bold}>10. Changes to Terms</Text>{"\n"}
          We may update these Terms at any time. Continued use after updates constitutes acceptance of the revised Terms.{"\n\n"}

          <Text style={styles.bold}>11. Public Terms</Text>{"\n"}
          The latest public version of these Terms is available at {APP_TERMS_URL}.{"\n\n"}

          <Text style={styles.bold}>12. Contact</Text>{"\n"}
          {APP_DEVELOPER_NAME} — {APP_SUPPORT_EMAIL}
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
