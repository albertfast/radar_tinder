import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useAuthStore } from '../store/authStore';
import { BlurView } from 'expo-blur';

const { width } = Dimensions.get('window');
const allowLayoutAnimations = Platform.OS !== 'android';

const RegisterScreen = ({ navigation }: any) => {
  const { signUp, isLoading } = useAuthStore();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loadingLocal, setLoadingLocal] = useState(false);

  const handleRegister = async () => {
    if (!name || !email || !password || !confirmPassword) {
      Alert.alert('Missing Fields', 'Please fill in all fields.');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Password Mismatch', 'Passwords do not match.');
      return;
    }

    setLoadingLocal(true);
    try {
      const { data, error } = await signUp(email, password);
      
      if (error) {
        Alert.alert('Registration Failed', error.message || 'Something went wrong.');
      } else {
        Alert.alert('Success', 'Account created! Please verify your email or log in.', [
          { text: 'OK', onPress: () => navigation.navigate('Login') }
        ]);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoadingLocal(false);
    }
  };

  const isWorking = isLoading || loadingLocal;

  const keyboardProps = Platform.OS === 'ios' ? { behavior: 'padding' as const } : {};
  const KeyboardContainer = Platform.OS === 'ios' ? KeyboardAvoidingView : View;

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0F172A', '#1E293B', '#111']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      
      {/* Decorative gradient orb */}
      <View style={styles.orb} />

      <KeyboardContainer
        {...keyboardProps}
        style={styles.keyboardView}
      >
        <Animated.View
          entering={allowLayoutAnimations ? FadeInDown.delay(200).springify() : undefined}
          style={styles.content}
        >
          
          <View style={styles.header}>
            <Animated.View entering={allowLayoutAnimations ? FadeInUp.delay(400).springify() : undefined}>
                <MaterialCommunityIcons name="shield-account" size={60} color="#6C63FF" />
            </Animated.View>
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>Join the safe driving network</Text>
          </View>

          <View style={styles.formContainer}>
            {/* Name Input */}
            <View style={styles.inputWrapper}>
                <MaterialCommunityIcons name="account-outline" size={20} color="#94A3B8" style={styles.inputIcon} />
                <TextInput
                  placeholder="Full Name"
                  placeholderTextColor="#64748B"
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                />
            </View>

            {/* Email Input */}
            <View style={styles.inputWrapper}>
                <MaterialCommunityIcons name="email-outline" size={20} color="#94A3B8" style={styles.inputIcon} />
                <TextInput
                  placeholder="Email Address"
                  placeholderTextColor="#64748B"
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
            </View>

            {/* Password Input */}
            <View style={styles.inputWrapper}>
                <MaterialCommunityIcons name="lock-outline" size={20} color="#94A3B8" style={styles.inputIcon} />
                <TextInput
                  placeholder="Password"
                  placeholderTextColor="#64748B"
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                />
            </View>

            {/* Confirm Password Input */}
            <View style={styles.inputWrapper}>
                <MaterialCommunityIcons name="lock-check-outline" size={20} color="#94A3B8" style={styles.inputIcon} />
                <TextInput
                  placeholder="Confirm Password"
                  placeholderTextColor="#64748B"
                  style={styles.input}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                />
            </View>

            <TouchableOpacity 
                style={styles.registerButton} 
                onPress={handleRegister}
                disabled={isWorking}
            >
                {isWorking ? (
                    <ActivityIndicator color="white" />
                ) : (
                    <LinearGradient
                        colors={['#6C63FF', '#4834d4']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.gradientButton}
                    >
                        <Text style={styles.buttonText}>CREATE ACCOUNT</Text>
                    </LinearGradient>
                )}
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account?</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={styles.loginLink}>Log In</Text>
            </TouchableOpacity>
          </View>

        </Animated.View>
      </KeyboardContainer>
    </View>
  );
};

// Custom TextInput to avoid Paper dependency issues with transparency
import { TextInput } from 'react-native';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  orb: {
    position: 'absolute',
    top: -100,
    right: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: '#6C63FF',
    opacity: 0.2,
    transform: [{ scale: 1.5 }],
  },
  keyboardView: {
    flex: 1,
    justifyContent: 'center',
  },
  content: {
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#F8FAFC',
    marginTop: 16,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 16,
    color: '#94A3B8',
    marginTop: 8,
  },
  formContainer: {
    width: '100%',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(30, 41, 59, 0.8)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.2)',
    marginBottom: 16,
    height: 60,
    paddingHorizontal: 16,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    color: '#F8FAFC',
    fontSize: 16,
    height: '100%',
  },
  registerButton: {
    marginTop: 24,
    borderRadius: 16,
    overflow: 'hidden',
    height: 60,
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  gradientButton: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 32,
    gap: 8,
  },
  footerText: {
    color: '#94A3B8',
    fontSize: 14,
  },
  loginLink: {
    color: '#6C63FF',
    fontSize: 14,
    fontWeight: 'bold',
  },
});

export default RegisterScreen;
