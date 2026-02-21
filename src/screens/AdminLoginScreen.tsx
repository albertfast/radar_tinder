import React, { useState } from 'react';
import { View, StyleSheet, TextInput, TouchableOpacity, Alert } from 'react-native';
import { Text } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuthStore } from '../store/authStore';

const ADMIN_USERNAME = 'albertfast';
const ADMIN_PASSWORD = 'abc123';

const AdminLoginScreen = ({ navigation }: any) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { updateUser } = useAuthStore();

  const handleLogin = () => {
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      updateUser({ 
        isAdminSession: true,
        subscriptionType: 'pro'
      });
      
      Alert.alert('Sign in successful', 'Admin session enabled. You now have full feature access.', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } else {
      Alert.alert('Sign in failed', 'Invalid username or password.');
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0F172A', '#020617']} style={StyleSheet.absoluteFill} />
      
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
        <MaterialCommunityIcons name="close" size={28} color="white" />
      </TouchableOpacity>

      <View style={styles.content}>
        <View style={styles.iconBox}>
          <MaterialCommunityIcons name="shield-crown" size={48} color="#EF4444" />
        </View>
        
        <Text style={styles.title}>Admin Sign In</Text>
        <Text style={styles.subtitle}>Sign in to unlock all features</Text>

        <View style={styles.form}>
          <View style={styles.inputBox}>
            <MaterialCommunityIcons name="account" size={20} color="#64748B" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Username"
              placeholderTextColor="#64748B"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.inputBox}>
            <MaterialCommunityIcons name="lock" size={20} color="#64748B" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#64748B"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
              <MaterialCommunityIcons 
                name={showPassword ? "eye-off" : "eye"} 
                size={20} 
                color="#64748B" 
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={handleLogin} style={styles.loginBtn}>
            <LinearGradient colors={['#EF4444', '#DC2626']} style={styles.loginGradient}>
              <Text style={styles.loginText}>Sign In</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {__DEV__ && (
          <View style={styles.devHint}>
            <Text style={styles.devHintText}>🔧 DEV: albertfast / abc123</Text>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backBtn: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  iconBox: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: 'rgba(239,68,68,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: 'white',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#94A3B8',
    marginBottom: 32,
    textAlign: 'center',
  },
  form: {
    width: '100%',
    maxWidth: 400,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: 16,
    paddingHorizontal: 16,
    height: 54,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    color: 'white',
    fontSize: 16,
  },
  eyeBtn: {
    padding: 8,
  },
  loginBtn: {
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 8,
  },
  loginGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
  devHint: {
    marginTop: 24,
    padding: 12,
    backgroundColor: 'rgba(245,158,11,0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
  },
  devHintText: {
    color: '#F59E0B',
    fontSize: 12,
    fontFamily: 'monospace',
  },
});

export default AdminLoginScreen;
