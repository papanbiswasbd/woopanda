import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Lock, Mail, Key, LogIn, ShieldCheck, Sparkles, AlertCircle } from 'lucide-react-native';
import { firebaseAuthService } from '../../shared/services/firebase/authService';
import { useAuthStore } from '../../shared/store/authStore';

export default function LoginRegistrationScreen() {
  const { setFirebaseUser } = useAuthStore();
  
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!email.trim() || !password) {
      setErrorMessage('Please enter both your email address and password.');
      return;
    }
    if (isRegistering && password !== confirmPassword) {
      setErrorMessage('Passwords do not match. Please retype carefully.');
      return;
    }
    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    let res;
    if (isRegistering) {
      res = await firebaseAuthService.registerWithEmail(email, password);
    } else {
      res = await firebaseAuthService.loginWithEmail(email, password);
    }

    setLoading(false);
    if (res.error || !res.user) {
      setErrorMessage(res.error || 'Authentication failed. Please check your details.');
      return;
    }

    // Success! Update auth store profile and let root router transition seamlessly
    await setFirebaseUser(res.user);
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-950">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
          
          {/* Header Brand Section */}
          <View className="items-center mb-8">
            <View className="bg-blue-600/20 border border-blue-500/40 p-4 rounded-lg mb-4">
              <Sparkles size={36} color="#3B82F6" />
            </View>
            <Text className="text-white font-black text-2xl text-center">WooPanda Command Hub</Text>
            <Text className="text-slate-400 font-semibold text-xs mt-1.5 text-center px-4">
              Sign in to manage your WooCommerce store analytics across all your devices seamlessly.
            </Text>
          </View>

          {/* Authentication Card */}
          <View className="bg-slate-900 border border-slate-800 rounded-lg p-6 shadow-2xl">
            
            {/* Mode Selector Tab Bar */}
            <View className="flex-row bg-slate-950 border border-slate-800 rounded-lg p-1 mb-6">
              <TouchableOpacity
                onPress={() => { setIsRegistering(false); setErrorMessage(null); }}
                className={`flex-1 py-2.5 rounded-md items-center justify-center ${!isRegistering ? 'bg-blue-600' : 'bg-transparent'}`}
                activeOpacity={0.8}
              >
                <Text className={`text-xs font-black ${!isRegistering ? 'text-white' : 'text-slate-400'}`}>Sign In</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { setIsRegistering(true); setErrorMessage(null); }}
                className={`flex-1 py-2.5 rounded-md items-center justify-center ${isRegistering ? 'bg-blue-600' : 'bg-transparent'}`}
                activeOpacity={0.8}
              >
                <Text className={`text-xs font-black ${isRegistering ? 'text-white' : 'text-slate-400'}`}>New Account</Text>
              </TouchableOpacity>
            </View>

            {/* Error Message Box */}
            {errorMessage && (
              <View className="bg-red-500/10 border border-red-500/30 rounded-lg p-3.5 mb-5 flex-row items-center gap-2.5">
                <AlertCircle size={18} color="#EF4444" />
                <Text className="text-red-400 font-bold text-xs flex-1">{errorMessage}</Text>
              </View>
            )}

            {/* Input Fields */}
            <View className="gap-4">
              <View>
                <Text className="text-slate-300 font-bold text-xs uppercase mb-2">Email Address</Text>
                <View className="flex-row items-center bg-slate-950 border border-slate-800 rounded-lg px-3.5 h-12">
                  <Mail size={18} color="#64748B" />
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    placeholder="name@store.com"
                    placeholderTextColor="#475569"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    className="flex-1 ml-3 text-white font-bold text-sm"
                  />
                </View>
              </View>

              <View>
                <Text className="text-slate-300 font-bold text-xs uppercase mb-2">Password</Text>
                <View className="flex-row items-center bg-slate-950 border border-slate-800 rounded-lg px-3.5 h-12">
                  <Lock size={18} color="#64748B" />
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Min 6 characters..."
                    placeholderTextColor="#475569"
                    secureTextEntry
                    className="flex-1 ml-3 text-white font-bold text-sm"
                  />
                </View>
              </View>

              {isRegistering && (
                <View>
                  <Text className="text-slate-300 font-bold text-xs uppercase mb-2">Confirm Password</Text>
                  <View className="flex-row items-center bg-slate-950 border border-slate-800 rounded-lg px-3.5 h-12">
                    <Key size={18} color="#64748B" />
                    <TextInput
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      placeholder="Repeat password..."
                      placeholderTextColor="#475569"
                      secureTextEntry
                      className="flex-1 ml-3 text-white font-bold text-sm"
                    />
                  </View>
                </View>
              )}

              {/* Submit Action Button */}
              <TouchableOpacity
                onPress={handleSubmit}
                disabled={loading}
                className={`h-12 rounded-lg items-center justify-center flex-row gap-2 mt-2 shadow-sm shadow-blue-500/30 ${
                  loading ? 'bg-blue-800' : 'bg-blue-600 active:bg-blue-700'
                }`}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <LogIn size={18} color="#FFFFFF" />
                    <Text className="text-white font-extrabold text-sm uppercase tracking-wider">
                      {isRegistering ? 'Register Account' : 'Authenticate & Open'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Security Guarantee Badge */}
          <View className="flex-row items-center justify-center gap-2 mt-8">
            <ShieldCheck size={15} color="#10B981" />
            <Text className="text-slate-500 text-xs font-semibold">
              End-to-end cloud encrypted WooCommerce credential sync.
            </Text>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
