import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../shared/store/authStore';
import { apiClient } from '../../shared/services/api/client';
import { Globe, Key, Lock, User, Shield, Info, AlertTriangle, Cpu, ArrowLeft, CheckCircle2 } from 'lucide-react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { syncService } from '../../shared/services/syncService';

export default function ConnectStoreScreen() {
  const { setCredentials, disconnectStore, firebaseUser } = useAuthStore();
  
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
    const maxAttempts = 40; // Poll for 60 seconds max
    const intervalTime = 1500;

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
        const res = await fetch(`https://webhook.site/token/${tokenId}/request/latest`, {
          headers: { 'Accept': 'application/json' }
        });

        if (res.status === 200) {
          const requestData = await res.json();
          if (requestData && requestData.content) {
            clearInterval(poll);
            setStatusMessage('Credentials verified! Splicing SQLite tables...');
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

            // Save credentials in local SecureStore and automatically upload to Firestore cloud profile!
            await setCredentials(tempCreds, true);

            console.log('Testing WooCommerce API connection with url:', cleanUrl);
            await apiClient.get('products?per_page=1', { timeout: 10000 });

            await syncService.syncStoreCurrency().catch(() => {});

            Alert.alert('Success', 'WooCommerce Auto-Connect successful! Store saved to your cloud account.');
            setLoading(false);
            setStatusMessage('');

            try {
              await fetch(`https://webhook.site/token/${tokenId}`, { method: 'DELETE' });
            } catch (e) {
              console.log('Error deleting Webhook.site token (non-fatal):', e);
            }
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

      const appName = 'WooPanda';
      const scope = 'read_write';
      const returnUrl = Linking.createURL('auth-callback', { queryParams: { token_id: tokenId } });
      const callbackUrl = `https://webhook.site/${tokenId}`;

      const authorizeUrl = `${cleanUrl}/wc-auth/v1/authorize?app_name=${encodeURIComponent(appName)}&scope=${scope}&user_id=1&return_url=${encodeURIComponent(returnUrl)}&callback_url=${encodeURIComponent(callbackUrl)}`;

      let isCancelled = false;
      const pollId = fetchKeysFromWebhookSite(tokenId, () => isCancelled);

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

    if (!siteUrl) {
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

    if (authMethod === 'keys' && (!consumerKey.trim() || !consumerSecret.trim())) {
      setError('WooCommerce Consumer Key and Consumer Secret are required.');
      return;
    } else if (authMethod === 'jwt' && !jwtToken.trim()) {
      setError('JWT Bearer Token is required.');
      return;
    } else if (authMethod === 'app_password' && (!username.trim() || !password.trim())) {
      setError('Username and Application Password are required.');
      return;
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
      // Save locally and upload to Firestore user profile
      await setCredentials(tempCreds, true);

      console.log('Testing WooCommerce API connection with url:', cleanUrl);
      await apiClient.get('products?per_page=1', { timeout: 10000 });

      await syncService.syncStoreCurrency().catch(() => {});

      Alert.alert('Store Attached', 'Successfully connected to your WooCommerce store! Credential profile backed up to cloud.');
    } catch (err: any) {
      console.error('API Verification error:', err);
      await disconnectStore();
      
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
    <SafeAreaView className="flex-1 bg-slate-950">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="px-6 py-8">
          <View className="flex-1 justify-center max-w-md mx-auto w-full">
            
            {/* User Profile Banner */}
            {firebaseUser && (
              <View className="bg-slate-900 border border-slate-800 rounded-lg p-3.5 mb-6 flex-row items-center justify-between">
                <View className="flex-row items-center gap-2.5">
                  <CheckCircle2 size={16} color="#10B981" />
                  <Text className="text-slate-300 font-bold text-xs" numberOfLines={1}>Logged in as {firebaseUser.email || 'Cloud Account'}</Text>
                </View>
                <View className="bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                  <Text className="text-emerald-400 font-extrabold text-[10px] uppercase">Cloud Ready</Text>
                </View>
              </View>
            )}

            {/* Header / Logo */}
            <View className="items-center mb-6">
              <View className="w-16 h-16 bg-blue-600 rounded-lg items-center justify-center shadow-lg shadow-blue-500/30 mb-4">
                <Shield size={32} color="#FFFFFF" />
              </View>
              <Text className="text-2xl font-black text-white text-center">Connect WooCommerce Store</Text>
              <Text className="text-slate-400 text-center mt-1.5 text-xs font-semibold px-2">
                Link your WooCommerce store once. It will sync across all your devices automatically.
              </Text>
            </View>

            {/* Error Message Box */}
            {error && (
              <View className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6 flex-row items-center gap-3">
                <AlertTriangle size={18} color="#EF4444" />
                <Text className="text-red-400 text-xs flex-1 font-bold">{error}</Text>
              </View>
            )}

            {/* Form Container */}
            <View className="bg-slate-900 border border-slate-800 rounded-lg p-5 shadow-2xl">
              
              {/* Site URL Field */}
              <View className="mb-5">
                <Text className="text-slate-300 font-bold mb-2 text-xs uppercase tracking-wider">
                  Store Website URL
                </Text>
                <View className="bg-slate-950 border border-slate-800 rounded-lg flex-row items-center px-3.5 h-12">
                  <Globe size={18} color="#64748B" />
                  <TextInput
                    value={siteUrl}
                    onChangeText={setSiteUrl}
                    placeholder="mystore.com"
                    placeholderTextColor="#475569"
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    className="flex-1 text-white font-bold ml-3 text-sm h-full"
                  />
                </View>
                <Text className="text-slate-500 text-[11px] mt-1.5 font-medium ml-0.5">
                  HTTPS protocol is strongly recommended for security.
                </Text>
              </View>

              {/* Authentication Type Tab bar */}
              <Text className="text-slate-300 font-bold mb-2 text-xs uppercase tracking-wider">Authentication Method</Text>
              <View className="flex-row flex-wrap bg-slate-950 p-1.5 rounded-lg mb-5 border border-slate-800 gap-1">
                {(['auto', 'keys', 'jwt', 'app_password'] as const).map((method) => (
                  <TouchableOpacity
                    key={method}
                    onPress={() => { setAuthMethod(method); setError(null); }}
                    className={`px-3 py-2 rounded-md flex-1 items-center justify-center ${
                      authMethod === method ? 'bg-blue-600 shadow-sm' : 'bg-transparent'
                    }`}
                  >
                    <Text className={`text-[11px] font-black ${
                      authMethod === method ? 'text-white' : 'text-slate-400'
                    }`}>
                      {method === 'auto' ? 'Auto-Connect' : method === 'keys' ? 'API Keys' : method === 'jwt' ? 'JWT Token' : 'App Pass'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Dynamic Inputs based on selected Auth Method */}
              {authMethod === 'auto' && (
                <View className="bg-blue-600/10 border border-blue-500/30 rounded-lg p-4 mb-6">
                  <View className="flex-row items-center gap-2 mb-1.5">
                    <Cpu size={16} color="#3B82F6" />
                    <Text className="text-blue-400 font-black text-xs uppercase tracking-wider">1-Click OAuth Handshake</Text>
                  </View>
                  <Text className="text-slate-400 text-xs leading-relaxed font-medium">
                    You will be redirected to your WordPress Admin panel in a secure browser tab to authorize WooPanda. Your REST API keys will be generated and saved to your cloud profile automatically.
                  </Text>
                </View>
              )}

              {authMethod === 'keys' && (
                <View className="gap-4 mb-6">
                  <View>
                    <Text className="text-slate-300 text-xs font-bold mb-2 uppercase tracking-wider">Consumer Key</Text>
                    <View className="bg-slate-950 border border-slate-800 rounded-lg flex-row items-center px-3 h-12">
                      <Key size={18} color="#64748B" />
                      <TextInput
                        value={consumerKey}
                        onChangeText={setConsumerKey}
                        placeholder="ck_xxxxxxxxxxxxxxxxxxxxxxxxxx"
                        placeholderTextColor="#475569"
                        autoCapitalize="none"
                        autoCorrect={false}
                        className="flex-1 text-white font-bold ml-3 text-sm h-full"
                      />
                    </View>
                  </View>

                  <View>
                    <Text className="text-slate-300 text-xs font-bold mb-2 uppercase tracking-wider">Consumer Secret</Text>
                    <View className="bg-slate-950 border border-slate-800 rounded-lg flex-row items-center px-3 h-12">
                      <Lock size={18} color="#64748B" />
                      <TextInput
                        value={consumerSecret}
                        onChangeText={setConsumerSecret}
                        placeholder="cs_xxxxxxxxxxxxxxxxxxxxxxxxxx"
                        placeholderTextColor="#475569"
                        autoCapitalize="none"
                        autoCorrect={false}
                        secureTextEntry
                        className="flex-1 text-white font-bold ml-3 text-sm h-full"
                      />
                    </View>
                  </View>
                </View>
              )}

              {authMethod === 'jwt' && (
                <View className="mb-6">
                  <Text className="text-slate-300 text-xs font-bold mb-2 uppercase tracking-wider">JWT Bearer Token</Text>
                  <View className="bg-slate-950 border border-slate-800 rounded-lg flex-row items-center px-3 h-12">
                    <Lock size={18} color="#64748B" />
                    <TextInput
                      value={jwtToken}
                      onChangeText={setJwtToken}
                      placeholder="eyJhbGciOi..."
                      placeholderTextColor="#475569"
                      autoCapitalize="none"
                      autoCorrect={false}
                      className="flex-1 text-white font-bold ml-3 text-sm h-full"
                    />
                  </View>
                </View>
              )}

              {authMethod === 'app_password' && (
                <View className="gap-4 mb-6">
                  <View>
                    <Text className="text-slate-300 text-xs font-bold mb-2 uppercase tracking-wider">Username / Email</Text>
                    <View className="bg-slate-950 border border-slate-800 rounded-lg flex-row items-center px-3 h-12">
                      <User size={18} color="#64748B" />
                      <TextInput
                        value={username}
                        onChangeText={setUsername}
                        placeholder="admin"
                        placeholderTextColor="#475569"
                        autoCapitalize="none"
                        autoCorrect={false}
                        className="flex-1 text-white font-bold ml-3 text-sm h-full"
                      />
                    </View>
                  </View>

                  <View>
                    <Text className="text-slate-300 text-xs font-bold mb-2 uppercase tracking-wider">Application Password</Text>
                    <View className="bg-slate-950 border border-slate-800 rounded-lg flex-row items-center px-3 h-12">
                      <Lock size={18} color="#64748B" />
                      <TextInput
                        value={password}
                        onChangeText={setPassword}
                        placeholder="xxxx xxxx xxxx xxxx"
                        placeholderTextColor="#475569"
                        autoCapitalize="none"
                        autoCorrect={false}
                        secureTextEntry
                        className="flex-1 text-white font-bold ml-3 text-sm h-full"
                      />
                    </View>
                  </View>
                </View>
              )}

              {/* Submit / Status Button */}
              {authMethod === 'auto' && loading && statusMessage !== '' ? (
                <View className="items-center py-4">
                  <ActivityIndicator size="large" color="#3B82F6" />
                  <Text className="text-blue-400 text-xs mt-3 text-center font-bold">
                    {statusMessage}
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={handleConnect}
                  disabled={loading}
                  className={`h-12 rounded-lg justify-center items-center flex-row shadow-sm shadow-blue-500/30 ${
                    loading ? 'bg-blue-800' : 'bg-blue-600 active:bg-blue-700'
                  }`}
                  activeOpacity={0.85}
                >
                  {loading ? (
                    <>
                      <ActivityIndicator size="small" color="#FFFFFF" />
                      <Text className="text-white font-black text-sm ml-2.5">VERIFYING & SYNCING...</Text>
                    </>
                  ) : (
                    <Text className="text-white font-extrabold text-sm uppercase tracking-wider">
                      {authMethod === 'auto' ? 'Connect Automatically' : 'Save & Attach Store'}
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            </View>

            {/* Hint Card */}
            <View className="bg-slate-900 border border-slate-800 rounded-lg p-4 mt-6 flex-row gap-3">
              <Info size={18} color="#3B82F6" className="mt-0.5" />
              <View className="flex-1">
                <Text className="text-slate-200 font-black text-xs uppercase tracking-wider">
                  {authMethod === 'auto' ? 'Direct OAuth Linking' : 'Manual REST API Access'}
                </Text>
                <Text className="text-slate-400 text-xs mt-1 leading-relaxed font-semibold">
                  {authMethod === 'auto' 
                    ? 'Press "Connect Automatically" to link your store. WooCommerce will provision credentials directly into your app and backup to your account.'
                    : 'Configure credentials manually in WordPress Admin > WooCommerce > Settings > Advanced > REST API.'
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
