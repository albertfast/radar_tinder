import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, IconButton } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { useAutoHideTabBar } from '../hooks/use-auto-hide-tab-bar';
import { TAB_BAR_HEIGHT } from '../constants/layout';
import { APP_DISPLAY_NAME } from '../constants/appBrand';

const PrivacyScreen = ({ navigation }: any) => {
  const { onScroll, onScrollBeginDrag, onScrollEndDrag } = useAutoHideTabBar();
  return (
    <View style={styles.container}>
      <LinearGradient colors={['#000000', '#121212']} style={styles.background} />
      
      <View style={styles.header}>
        <IconButton icon="chevron-left" iconColor="white" size={30} onPress={() => navigation.goBack()} />
        <Text style={styles.headerTitle}>Privacy Policy</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: TAB_BAR_HEIGHT + 24 }]}
        onScroll={onScroll}
        onScrollBeginDrag={onScrollBeginDrag}
        onScrollEndDrag={onScrollEndDrag}
        scrollEventThrottle={16}
      >
        <Text style={styles.text}>
          <Text style={styles.bold}>Effective Date: January 2026</Text>{"\n\n"}

          This Privacy Policy explains how <Text style={styles.bold}>Aether Labs</Text> collects, uses, and protects information across our mobile applications, including {APP_DISPLAY_NAME}.{"\n\n"}

          <Text style={styles.bold}>1. Information We Collect</Text>{"\n"}
          <Text style={styles.bold}>Location Data:</Text> Used for navigation, alerts, and map-based features when you grant permission.{"\n"}
          <Text style={styles.bold}>Camera Access:</Text> Used for optional visual features and user-initiated capture.{"\n"}
          <Text style={styles.bold}>Microphone Access:</Text> Used only for optional audio or voice features triggered by you.{"\n"}
          <Text style={styles.bold}>Photos and Media:</Text> We access only the files you explicitly select.{"\n"}
          <Text style={styles.bold}>Bluetooth:</Text> May be used for nearby-device features relevant to app functionality.{"\n"}
          <Text style={styles.bold}>Account Information:</Text> Basic account data such as email for authentication and account management.{"\n"}
          <Text style={styles.bold}>Usage and Diagnostics:</Text> Anonymous or pseudonymous technical telemetry to improve reliability and performance.{"\n\n"}

          <Text style={styles.bold}>2. How We Use Information</Text>{"\n"}
          - Provide, maintain, and improve app functionality{"\n"}
          - Enable navigation, detection, and premium features{"\n"}
          - Support subscriptions, fraud prevention, and security{"\n"}
          - Diagnose crashes and service quality issues{"\n\n"}

          <Text style={styles.bold}>3. Data Sharing</Text>{"\n"}
          We do not sell personal data. Data may be processed by trusted service providers strictly required to operate the service (such as analytics, payments, authentication, and cloud infrastructure).{"\n\n"}

          <Text style={styles.bold}>4. Safety and Legal Notice</Text>{"\n"}
          Radar and traffic information may be delayed, incomplete, or inaccurate. You remain solely responsible for safe driving, legal compliance, and decisions taken while using the app. The app is an assistance tool and does not replace official traffic controls, law enforcement instructions, or your duty of care.{"\n\n"}

          <Text style={styles.bold}>5. Data Security</Text>{"\n"}
          We apply reasonable technical and organizational safeguards, but no system can be guaranteed fully secure.{"\n\n"}

          <Text style={styles.bold}>6. Children’s Privacy</Text>{"\n"}
          Our services are not directed to children under 13, and we do not knowingly collect personal data from children.{"\n\n"}

          <Text style={styles.bold}>7. Your Controls</Text>{"\n"}
          You can manage permissions (location, camera, microphone, Bluetooth, notifications) in your device settings at any time.{"\n\n"}

          <Text style={styles.bold}>8. Changes to This Policy</Text>{"\n"}
          We may update this policy from time to time. Continued use after updates means you accept the revised policy.{"\n\n"}

          <Text style={styles.bold}>9. Contact</Text>{"\n"}
          Aether Labs — aetherlabsapps@gmail.com
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
