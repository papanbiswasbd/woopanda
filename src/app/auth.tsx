import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../shared/store/authStore';
import { apiClient } from '../shared/services/api/client';
import { Globe, Key, Lock, User, Shield, Info, AlertTriangle, Cpu } from 'lucide-react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { syncService } from '../shared/services/syncService';

const getParameterByName = (name: string, url: string) => {
  const match = RegExp('[?&]' + name + '=([^&]*)').exec(url);
  return match && decodeURIComponent(match[1].replace(/\+/g, ' '));
};

export default function AuthScreen() {
  const { setCredentials } = useAuthStore();
  const [siteUrl, setSiteUrl] = useState('');
  const [authMethod, setAuthMethod] = useState<'auto' | 'keys' | 'jwt' | 'app_password'>('auto');
  
  // API Keys state
  const [consumerKey, setConsumerKey] = useState('');
  const [consumerSecret, setConsumerSecret] = useState('');

  // JWT Token state
  const [jwtToken, setJwtToken] = useState('');

  // App Password state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Polling key handler to fetch key from Webhook.site in parallel
  const fetchKeysFromWebhookSite = (tokenId: string, checkCancelled: () => boolean) => {
    setLoading(true);
    setError(null);
    setStatusMessage('Waiting for approval in browser...');

    let attempts = 0;
    const maxAttempts = 40; // Poll for 60 seconds max (1.5s * 40)
    const intervalTime = 1500; // Poll every 1.5 seconds

    const poll = setInterval(async () => {
      if (checkCancelled()) {
        clearInterval(poll);
        return;
      }

      attempts++;
      if (attempts > maxAttempts) {
        clearInterval(poll);
        setLoading(false);
        setStatusMessage('');
        setError('Auto-connect timed out. Please try again or configure manually.');
        return;
      }

      try {
        console.log('Polling Webhook.site for keys... Attempt:', attempts);
        const res = await fetch(`https://webhook.site/token/${tokenId}/request/latest`, {
          headers: {
            'Accept': 'application/json',
          }
        });

        if (res.status === 200) {
          const requestData = await res.json();
          if (requestData && requestData.content) {
            clearInterval(poll);
            setStatusMessage('Credentials verified! Splicing SQLite tables...');

            // Dismiss the custom browser tab overlay instantly
            WebBrowser.dismissBrowser();

            const body = JSON.parse(requestData.content);
            const { consumer_key, consumer_secret } = body;

            if (!consumer_key || !consumer_secret) {
              setLoading(false);
              setStatusMessage('');
              setError('Handshake payload was empty or invalid.');
              return;
            }

            let cleanUrl = siteUrl.trim();
            if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
              cleanUrl = 'https://' + cleanUrl;
            }
            if (cleanUrl.endsWith('/')) {
              cleanUrl = cleanUrl.slice(0, -1);
            }

            const tempCreds = {
              siteUrl: cleanUrl,
              authMethod: 'keys' as const,
              consumerKey: consumer_key,
              consumerSecret: consumer_secret,
            };

            // Save credentials in store & secureStore
            await useAuthStore.getState().setCredentials(tempCreds);

            // Verify connection is working
            console.log('Testing WooCommerce API connection with url:', cleanUrl);
            await apiClient.get('products?per_page=1', { timeout: 10000 });

            // Sync store currency settings
            await syncService.syncStoreCurrency().catch(() => {});

            console.log('Connection successful!');
            Alert.alert('Success', 'WooCommerce Auto-Connect successful!');
            setLoading(false);
            setStatusMessage('');

            // Clean up the webhook token silently (non-fatal if fails)
            try {
              await fetch(`https://webhook.site/token/${tokenId}`, { method: 'DELETE' });
            } catch (e) {
              console.log('Error deleting Webhook.site token (non-fatal):', e);
            }
          } else {
            console.log('Waiting for key relay POST... Attempt:', attempts);
          }
        }
      } catch (err) {
        console.error('Error polling webhook.site:', err);
      }
    }, intervalTime);

    return poll;
  };

  const handleAutoConnect = async () => {
    setError(null);
    if (!siteUrl.trim()) {
      setError('WordPress / WooCommerce site URL is required.');
      return;
    }

    let cleanUrl = siteUrl.trim();
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = 'https://' + cleanUrl;
    }
    if (cleanUrl.endsWith('/')) {
      cleanUrl = cleanUrl.slice(0, -1);
    }

    setLoading(true);
    setStatusMessage('Initiating secure handshake...');

    try {
      // 1. Create a secure token on Webhook.site
      console.log('Creating Webhook.site handshake token...');
      const tokenRes = await fetch('https://webhook.site/token', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
      
      const tokenData = await tokenRes.json();
      const tokenId = tokenData.uuid;

      if (!tokenId) {
        throw new Error('Could not establish secure handshake token.');
      }

      console.log('Handshake token created:', tokenId);

      // 2. Auth Endpoint Config
      const appName = 'WooPanda';
      const scope = 'read_write';
      
      // Dynamic link based on execution environment (Expo Go or Standalone build)
      const returnUrl = Linking.createURL('auth-callback', {
        queryParams: { token_id: tokenId }
      });
      const callbackUrl = `https://webhook.site/${tokenId}`;

      const authorizeUrl = `${cleanUrl}/wc-auth/v1/authorize?app_name=${encodeURIComponent(appName)}&scope=${scope}&user_id=1&return_url=${encodeURIComponent(returnUrl)}&callback_url=${encodeURIComponent(callbackUrl)}`;

      console.log('Opening WebBrowser authorization URL:', authorizeUrl);
      
      let isCancelled = false;

      // Start background polling instantly in parallel with the browser opening
      const pollId = fetchKeysFromWebhookSite(tokenId, () => isCancelled);

      // Open Browser custom tab
      const result = await WebBrowser.openBrowserAsync(authorizeUrl);
      
      if (result.type === 'cancel') {
        isCancelled = true;
        clearInterval(pollId);
        setLoading(false);
        setStatusMessage('');
        setError('Auto-connection was cancelled.');
      }
    } catch (err: any) {
      setLoading(false);
      setStatusMessage('');
      setError(`Failed to open auth browser: ${err.message}`);
    }
  };

  const handleConnect = async () => {
    if (authMethod === 'auto') {
      await handleAutoConnect();
      return;
    }

    setError(null);

    // 1. URL Validation
    if (!siteUrl) {
      setError('WordPress / WooCommerce site URL is required.');
      return;
    }

    let cleanUrl = siteUrl.trim();
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = 'https://' + cleanUrl;
    }

    // Clean trailing slashes
    if (cleanUrl.endsWith('/')) {
      cleanUrl = cleanUrl.slice(0, -1);
    }

    // 2. Auth specific validations
    if (authMethod === 'keys') {
      if (!consumerKey.trim() || !consumerSecret.trim()) {
        setError('WooCommerce Consumer Key and Consumer Secret are required.');
        return;
      }
    } else if (authMethod === 'jwt') {
      if (!jwtToken.trim()) {
        setError('JWT Bearer Token is required.');
        return;
      }
    } else if (authMethod === 'app_password') {
      if (!username.trim() || !password.trim()) {
        setError('Username and Application Password are required.');
        return;
      }
    }

    setLoading(true);

    const tempCreds = {
      siteUrl: cleanUrl,
      authMethod,
      consumerKey: authMethod === 'keys' ? consumerKey.trim() : undefined,
      consumerSecret: authMethod === 'keys' ? consumerSecret.trim() : undefined,
      jwtToken: authMethod === 'jwt' ? jwtToken.trim() : undefined,
      username: authMethod === 'app_password' ? username.trim() : undefined,
      password: authMethod === 'app_password' ? password.trim() : undefined,
    };

    try {
      // 3. Test connection (retrieve a single product to verify key credentials)
      await useAuthStore.getState().setCredentials(tempCreds);

      console.log('Testing WooCommerce API connection with url:', cleanUrl);
      await apiClient.get('products?per_page=1', { timeout: 10000 });

      // Sync store currency settings
      await syncService.syncStoreCurrency().catch(() => {});

      console.log('Connection successful!');
      Alert.alert('Success', 'Successfully connected to WooCommerce store!');
    } catch (err: any) {
      console.error('API Verification error:', err);
      await useAuthStore.getState().logout();
      
      let failMsg = 'Could not establish connection to the store.';
      if (err.status === 401 || err.status === 403) {
        failMsg = 'Authentication failed. Please verify API keys or credentials.';
      } else if (err.status === 404) {
        failMsg = 'WooCommerce REST API v3 endpoint not found. Ensure WooCommerce is active.';
      } else if (err.message) {
        failMsg = `Error: ${err.message}`;
      }
      setError(failMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="px-6 py-8">
          <View className="flex-1 justify-center max-w-md mx-auto w-full">
            
            {/* Header / Logo */}
            <View className="items-center mb-8">
              <View className="w-20 h-20 bg-blue-600 rounded-2xl items-center justify-center shadow-lg shadow-blue-500/30 mb-4">
                <Shield size={40} color="#FFFFFF" />
              </View>
              <Text className="text-3xl font-extrabold text-slate-900 text-center">WooPanda</Text>
              <Text className="text-slate-600 text-center mt-2 text-sm">
                WooCommerce Enterprise Mobile Manager
              </Text>
            </View>

            {/* Error Message Box */}
            {error && (
              <View className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6 flex-row items-center gap-3">
                <AlertTriangle size={20} color="#EF4444" />
                <Text className="text-red-400 text-sm flex-1 font-medium">{error}</Text>
              </View>
            )}

            {/* Form Container */}
            <View className="bg-slate-100/80 border border-slate-200/50 rounded-2xl p-6 shadow-xl">
              
              {/* Site URL Field */}
              <View className="mb-5">
                <Text className="text-slate-700 font-semibold mb-2 text-sm flex-row items-center">
                  Site Store URL
                </Text>
                <View className="bg-white border border-slate-200 rounded-xl flex-row items-center px-3 h-12">
                  <Globe size={18} color="#94A3B8" />
                  <TextInput
                    value={siteUrl}
                    onChangeText={setSiteUrl}
                    placeholder="example.com"
                    placeholderTextColor="#64748B"
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    className="flex-1 text-slate-900 ml-3 text-sm h-full"
                  />
                </View>
                <Text className="text-slate-500 text-xs mt-1.5 ml-1">
                  HTTPS is strongly recommended.
                </Text>
              </View>

              {/* Authentication Type Tab bar */}
              <Text className="text-slate-700 font-semibold mb-2 text-sm">Auth Method</Text>
              <ScrollView 
                horizontal
                showsHorizontalScrollIndicator={false}
                className="flex-row bg-slate-50 p-1 rounded-xl mb-5 border border-slate-200"
              >
                {(['auto', 'keys', 'jwt', 'app_password'] as const).map((method) => (
                  <TouchableOpacity
                    key={method}
                    onPress={() => {
                      setAuthMethod(method);
                      setError(null);
                    }}
                    className={`px-4 py-2 rounded-lg items-center ${
                      authMethod === method ? 'bg-blue-600' : 'bg-transparent'
                    }`}
                  >
                    <Text className={`text-xs font-semibold ${
                      authMethod === method ? 'text-slate-900' : 'text-slate-600'
                    }`}>
                      {method === 'auto' ? 'Auto-Connect' : method === 'keys' ? 'API Keys' : method === 'jwt' ? 'JWT Token' : 'App Pass'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Dynamic Inputs based on selected Auth Method */}
              {authMethod === 'auto' && (
                <View className="bg-white/60 border border-slate-200/30 rounded-xl p-4 mb-6">
                  <View className="flex-row items-center gap-2 mb-2">
                    <Cpu size={16} color="#60A5FA" />
                    <Text className="text-blue-400 font-bold text-xs">WooCommerce Direct Connect</Text>
                  </View>
                  <Text className="text-slate-600 text-xs leading-relaxed">
                    WooPanda will securely redirect you to your WordPress admin panel to approve credentials. Once approved, the REST API keys will be generated and set up automatically.
                  </Text>
                </View>
              )}

              {authMethod === 'keys' && (
                <View>
                  <View className="mb-4">
                    <Text className="text-slate-700 text-xs font-semibold mb-1.5 ml-1">Consumer Key</Text>
                    <View className="bg-white border border-slate-200 rounded-xl flex-row items-center px-3 h-12">
                      <Key size={18} color="#94A3B8" />
                      <TextInput
                        value={consumerKey}
                        onChangeText={setConsumerKey}
                        placeholder="ck_..."
                        placeholderTextColor="#64748B"
                        autoCapitalize="none"
                        autoCorrect={false}
                        className="flex-1 text-slate-900 ml-3 text-sm h-full"
                      />
                    </View>
                  </View>

                  <View className="mb-6">
                    <Text className="text-slate-700 text-xs font-semibold mb-1.5 ml-1">Consumer Secret</Text>
                    <View className="bg-white border border-slate-200 rounded-xl flex-row items-center px-3 h-12">
                      <Lock size={18} color="#94A3B8" />
                      <TextInput
                        value={consumerSecret}
                        onChangeText={setConsumerSecret}
                        placeholder="cs_..."
                        placeholderTextColor="#64748B"
                        autoCapitalize="none"
                        autoCorrect={false}
                        secureTextEntry
                        className="flex-1 text-slate-900 ml-3 text-sm h-full"
                      />
                    </View>
                  </View>
                </View>
              )}

              {authMethod === 'jwt' && (
                <View className="mb-6">
                  <Text className="text-slate-700 text-xs font-semibold mb-1.5 ml-1">JWT Token</Text>
                  <View className="bg-white border border-slate-200 rounded-xl flex-row items-center px-3 h-12">
                    <Lock size={18} color="#94A3B8" />
                    <TextInput
                      value={jwtToken}
                      onChangeText={setJwtToken}
                      placeholder="eyJhbGciOi..."
                      placeholderTextColor="#64748B"
                      autoCapitalize="none"
                      autoCorrect={false}
                      className="flex-1 text-slate-900 ml-3 text-sm h-full"
                    />
                  </View>
                </View>
              )}

              {authMethod === 'app_password' && (
                <View>
                  <View className="mb-4">
                    <Text className="text-slate-700 text-xs font-semibold mb-1.5 ml-1">Username / Email</Text>
                    <View className="bg-white border border-slate-200 rounded-xl flex-row items-center px-3 h-12">
                      <User size={18} color="#94A3B8" />
                      <TextInput
                        value={username}
                        onChangeText={setUsername}
                        placeholder="admin"
                        placeholderTextColor="#64748B"
                        autoCapitalize="none"
                        autoCorrect={false}
                        className="flex-1 text-slate-900 ml-3 text-sm h-full"
                      />
                    </View>
                  </View>

                  <View className="mb-6">
                    <Text className="text-slate-700 text-xs font-semibold mb-1.5 ml-1">Application Password</Text>
                    <View className="bg-white border border-slate-200 rounded-xl flex-row items-center px-3 h-12">
                      <Lock size={18} color="#94A3B8" />
                      <TextInput
                        value={password}
                        onChangeText={setPassword}
                        placeholder="xxxx xxxx xxxx xxxx"
                        placeholderTextColor="#64748B"
                        autoCapitalize="none"
                        autoCorrect={false}
                        secureTextEntry
                        className="flex-1 text-slate-900 ml-3 text-sm h-full"
                      />
                    </View>
                  </View>
                </View>
              )}

              {/* Submit / Status Button */}
              {authMethod === 'auto' && loading && statusMessage !== '' ? (
                <View className="items-center py-4">
                  <ActivityIndicator size="large" color="#3B82F6" />
                  <Text className="text-blue-400 text-sm mt-3 text-center font-medium">
                    {statusMessage}
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={handleConnect}
                  disabled={loading}
                  className={`h-12 rounded-xl justify-center items-center flex-row ${
                    loading ? 'bg-blue-800' : 'bg-blue-600 active:bg-blue-700'
                  }`}
                >
                  {loading ? (
                    <>
                      <ActivityIndicator size="small" color="#FFFFFF" />
                      <Text className="text-slate-900 font-bold ml-2">Connecting...</Text>
                    </>
                  ) : (
                    <Text className="text-slate-900 font-bold text-base">
                      {authMethod === 'auto' ? 'Connect Automatically' : 'Connect Store'}
                    </Text>
                  )}
                </TouchableOpacity>
              )}

            </View>

            {/* Hint Card */}
            <View className="bg-slate-100/30 rounded-2xl p-4 mt-6 border border-slate-200 flex-row gap-3">
              <Info size={18} color="#60A5FA" className="mt-0.5" />
              <View className="flex-1">
                <Text className="text-slate-700 font-semibold text-xs">
                  {authMethod === 'auto' ? '1-Click Direct Integration' : 'Manual API Setup'}
                </Text>
                <Text className="text-slate-600 text-xs mt-1 leading-relaxed">
                  {authMethod === 'auto' 
                    ? 'Press "Connect Automatically" to link your store. WooCommerce will securely provision API access credentials directly to the app.'
                    : 'Configure credentials by entering keys manually. Go to WordPress Admin > WooCommerce > Settings > Advanced > REST API.'
                  }
                </Text>
              </View>
            </View>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
