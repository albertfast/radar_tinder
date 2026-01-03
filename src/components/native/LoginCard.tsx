import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface LoginCardProps {
  onSubmit?: (email: string, password: string) => void;
  onGithub?: () => void;
  onGoogle?: () => void;
}

const LoginCard = ({ onSubmit, onGithub, onGoogle }: LoginCardProps) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = () => {
    if (onSubmit) {
      onSubmit(email, password);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.logoRow}>
        <View style={styles.logoBadge}>
          <MaterialCommunityIcons name="radar" size={18} color="#111111" />
        </View>
        <Text style={styles.brandText}>Radar Tinder</Text>
      </View>
      <Text style={styles.title}>Sign in to your account</Text>
      <Text style={styles.subtitle}>Don't have an account? Sign up</Text>

      <View style={styles.socialRow}>
        <TouchableOpacity style={styles.socialButton} onPress={onGithub}>
          <MaterialCommunityIcons name="github" size={16} color="#111827" />
          <Text style={styles.socialText}>Login with GitHub</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.socialButton} onPress={onGoogle}>
          <MaterialCommunityIcons name="google" size={16} color="#111827" />
          <Text style={styles.socialText}>Login with Google</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>OR</Text>
        <View style={styles.dividerLine} />
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="name@example.com"
          placeholderTextColor="#A1A1AA"
        />
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="********"
          placeholderTextColor="#A1A1AA"
          secureTextEntry
        />
      </View>

      <TouchableOpacity style={styles.primaryButton} onPress={handleSubmit}>
        <Text style={styles.primaryButtonText}>Sign in</Text>
      </TouchableOpacity>

      <Text style={styles.footerText}>Forgot your password? Reset password</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    padding: 24,
    borderWidth: 1,
    borderColor: '#ECECEC',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoBadge: {
    width: 32,
    height: 32,
    borderRadius: 12,
    backgroundColor: '#FFD24A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  title: {
    marginTop: 18,
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  subtitle: {
    marginTop: 6,
    fontSize: 13,
    color: '#6B7280',
  },
  socialRow: {
    marginTop: 18,
    gap: 10,
  },
  socialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 10,
  },
  socialText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111827',
  },
  dividerRow: {
    marginVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  dividerText: {
    fontSize: 10,
    color: '#6B7280',
    fontWeight: '700',
  },
  fieldGroup: {
    marginBottom: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#111827',
    backgroundColor: '#FFFFFF',
  },
  primaryButton: {
    marginTop: 6,
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  footerText: {
    marginTop: 14,
    fontSize: 12,
    color: '#6B7280',
  },
});

export default LoginCard;
