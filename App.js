import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Alert, Platform, Text, Button, AppState, StatusBar as RNStatusBar } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import * as Device from 'expo-device';
import socketInstance from './src/services/WebSocketService';
import apiService from './src/services/ApiService';
import enhancedNotificationService from './src/services/EnhancedNotificationService';
import { getTokenExtractionScript, parseWebViewMessage, getLoginDebugScript } from './src/utils/webViewUtils';

const BACKGROUND_NOTIFICATION_TASK = 'BACKGROUND_NOTIFICATION_TASK';
const BACKGROUND_FETCH_TASK = 'BACKGROUND_FETCH_TASK';

const STATUS_BAR_COLORS = {
  light: '#F8F9FA',
  dark: '#131920'
};

const getThemeModeScript = `
  (function() {
    try {
      const config = localStorage.getItem('zylo-config');
      if (config) {
        const parsedConfig = JSON.parse(config);
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'theme',
          mode: parsedConfig.mode || 'light'
        }));
      } else {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'theme',
          mode: 'light'
        }));
      }
    } catch (e) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'theme',
        mode: 'light',
        error: e.message
      }));
    }
    true;
  })();
`;

const themeChangeListenerScript = `
(function() {
  let lastMode;
  
  function checkThemeChange() {
    try {
      const config = localStorage.getItem('zylo-config');
      if (config) {
        const parsedConfig = JSON.parse(config);
        const currentMode = parsedConfig.mode || 'light';
        
        if (currentMode !== lastMode) {
          lastMode = currentMode;
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'theme',
            mode: currentMode
          }));
        }
      }
    } catch (e) {
      console.error('Error checking theme change:', e);
    }
  }
  
  // Check every second
  setInterval(checkThemeChange, 1000);
  
  // Also listen for storage events
  window.addEventListener('storage', function(e) {
    if (e.key === 'zylo-config') {
      checkThemeChange();
    }
  });
  
  true;
})();
`;

// Sadece gerçek cihazlarda task'ları tanımla
if (Device.isDevice) {
  TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, ({ data, error, executionInfo }) => {
    if (error) {
      return;
    }
    
    if (data) {
      const { notification } = data;
      processBackgroundNotification(notification);
    }
  });

  TaskManager.defineTask(BACKGROUND_FETCH_TASK, async () => {
    try {
      const lastAuthToken = await getLastAuthToken();
      if (lastAuthToken) {
        await fetch('https://zylo.vet/api/mobile/ping', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${lastAuthToken}`
          },
          body: JSON.stringify({
            timestamp: new Date().toISOString(),
            device_active: true
          })
        });
      }
      
      return BackgroundFetch.BackgroundFetchResult.NewData;
    } catch (error) {
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }
  });
}

async function processBackgroundNotification(notification) {
  try {
    // Bildirim işleme mantığı burada olacak
  } catch (error) {
    // Hataları sessizce yakala
  }
}

async function getLastAuthToken() {
  return apiService.loadTokenFromStorage();
}

async function registerPushTokenWithServer(token, authToken) {
  if (!authToken || !token) return false;
  
  apiService.setToken(authToken);
  const result = await apiService.registerPushToken(token);
  return result.success;
}

if (Platform.OS === 'android' || Platform.OS === 'ios') {
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true, 
    shouldPlaySound: true,  
    shouldSetBadge: true,   
    priority: Notifications.AndroidNotificationPriority.HIGH,  
    sound: './assets/notification_sound.wav'  
  }),
});

export default function App() {
  const [expoPushToken, setExpoPushToken] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [webViewError, setWebViewError] = useState(null);
  const [socketStatus, setSocketStatus] = useState('disconnected');
  const [appState, setAppState] = useState(AppState.currentState);
  const [themeMode, setThemeMode] = useState('light'); // Default to light theme
  const webViewRef = useRef(null);
  const notificationListener = useRef();
  const responseListener = useRef();
  const tokenRegistered = useRef(false);

  useEffect(() => {
    const checkTheme = () => {
      if (webViewRef.current) {
        webViewRef.current.injectJavaScript(getThemeModeScript);
      }
    };

    const initialCheck = setTimeout(checkTheme, 2000);

    return () => clearTimeout(initialCheck);
  }, [webViewRef.current]);

  useEffect(() => {
    registerBackgroundTasks();
    return () => unregisterBackgroundTasks();
  }, []);

  const registerBackgroundTasks = async () => {
    // Expo Go'da background fetch desteklenmediği için sessizce geç
    if (__DEV__ && !Device.isDevice) {
      return;
    }
    
    try {
      await BackgroundFetch.registerTaskAsync(BACKGROUND_FETCH_TASK, {
        minimumInterval: 15 * 60, 
        stopOnTerminate: false,
        startOnBoot: true,
      });
    } catch (err) {
      // Hataları sessizce yakala
    }
  };
  
  const unregisterBackgroundTasks = async () => {
    if (__DEV__ && !Device.isDevice) {
      return;
    }
    
    try {
      await BackgroundFetch.unregisterTaskAsync(BACKGROUND_FETCH_TASK);
    } catch (err) {
      // Hataları sessizce yakala
    }
  };

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      setAppState(nextAppState);

              if (appState.match(/inactive|background/) && nextAppState === 'active') {
        if (authToken && socketStatus !== 'connected') {
          reconnectSocket();
        }
        
        if (webViewRef.current) {
          webViewRef.current.injectJavaScript(getThemeModeScript);
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [appState, authToken, socketStatus]);

  useEffect(() => {
    registerForPushNotificationsAsync().then(token => {
      if (token) {
        setExpoPushToken(token);
      }
    });

    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      
      if (appState === 'active') {
      }
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      
      const data = response.notification.request.content.data;
      handleNotificationResponse(data);
    });

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, [appState]);
  
  useEffect(() => {
    const registerTokenIfNeeded = async () => {
      if (authToken && expoPushToken && !tokenRegistered.current) {
        const success = await registerPushTokenWithServer(expoPushToken, authToken);
        if (success) {
          tokenRegistered.current = true;
          
          // Enhanced notification service ile de kaydet
          if (enhancedNotificationService.isInitialized) {
            await enhancedNotificationService.registerPushToken(expoPushToken);
          }
        }
      }
    };
    
    registerTokenIfNeeded();
  }, [authToken, expoPushToken]);

  useEffect(() => {
    if (authToken) {
      
      socketInstance.initialize(authToken, (errorMessage) => {
        setSocketStatus('error');
        setWebViewError({
          message: errorMessage,
          type: 'websocket'
        });
      });
      
      const statusInterval = setInterval(() => {
        const currentStatus = socketInstance.getConnectionStatus();
        setSocketStatus(currentStatus);
        
        if (currentStatus === 'connected' && webViewError && webViewError.type === 'websocket') {
          setWebViewError(null);
          
          // Enhanced notification service'i başlat
          enhancedNotificationService.initialize().then((success) => {
            if (success) {
              // Push token'ı kaydet
              if (expoPushToken) {
                enhancedNotificationService.registerPushToken(expoPushToken);
              }
            }
          });
        }
      }, 1000);
      
      return () => {
        clearInterval(statusInterval);
        socketInstance.disconnect();
        enhancedNotificationService.cleanup();
      };
    }
  }, [authToken, expoPushToken]);

  const handleNotificationResponse = (data) => {
    return;
  };

  const handleWebViewMessage = (event) => {
    const data = parseWebViewMessage(event);
    if (!data) return;
    
    if (data.type === 'token') {
      setAuthToken(data.value);
      apiService.setToken(data.value); 
    } else if (data.type === 'theme') {
      if (data.mode && ['light', 'dark'].includes(data.mode)) {
        setThemeMode(data.mode);
      }
    } else if (data.type === 'console.log' || data.type === 'console.info') {
    } else if (data.type === 'console.error' || data.type === 'console.warn') {
      console.warn('WebView error:', data.data);
    } else if (data.type === 'login.error' || data.type === 'global.error') {
      setWebViewError({
        message: data.data.error || data.data.message || 'Unknown error',
        details: data.data,
        type: 'webview'
      });
    }
  };

  const handleWebViewError = (syntheticEvent) => {
    const { nativeEvent } = syntheticEvent;
    setWebViewError({
      message: nativeEvent.description || 'WebView error',
      details: nativeEvent,
      type: 'webview'
    });
  };

  const refreshWebView = () => {
    if (webViewRef.current) {
      webViewRef.current.reload();
      setWebViewError(null);
    }
  };

  const reconnectSocket = () => {
    if (authToken) {
      socketInstance.disconnect();
      setTimeout(() => {
        socketInstance.initialize(authToken);
      }, 500);
    }
  };

  const renderErrorBanner = () => {
    if (!webViewError) return null;
    
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{webViewError.message}</Text>
        <Button 
          title="Yenile" 
          onPress={webViewError.type === 'websocket' ? reconnectSocket : refreshWebView} 
        />
      </View>
    );
  };
  
  const getStatusBarColor = () => {
    return STATUS_BAR_COLORS[themeMode] || STATUS_BAR_COLORS.light;
  };

  const getStatusBarStyle = () => {
    return themeMode === 'dark' ? 'light' : 'dark';
  };

  return (
    <View style={[
      styles.container, 
      { backgroundColor: themeMode === 'dark' ? '#131920' : '#F8F9FA' }
    ]}>
      <RNStatusBar 
        backgroundColor="transparent" 
        barStyle={`${getStatusBarStyle()}-content`}
        translucent={true}
      />
      
      {webViewError && renderErrorBanner()}
      
      <View style={styles.webviewContainer}>
        <WebView
          ref={webViewRef}
          source={{ uri: 'https://zylo.vet' }}
          style={styles.webview}
          injectedJavaScript={getTokenExtractionScript() + getLoginDebugScript() + themeChangeListenerScript}
          onMessage={handleWebViewMessage}
          onError={handleWebViewError}
          onHttpError={handleWebViewError}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          startInLoadingState={true}
          allowsBackForwardNavigationGestures={true}
          pullToRefreshEnabled={true}
          mixedContentMode={'always'}
          originWhitelist={['*']}
          allowsInsecureConnections={true}
          thirdPartyCookiesEnabled={true}
          cacheEnabled={true}
          cacheMode="LOAD_DEFAULT"
          onShouldStartLoadWithRequest={(request) => {
            return true; 
          }}
        />
      </View>
    </View>
  );
}

async function registerForPushNotificationsAsync() {
  let token;

  // Expo Go'da push notification desteği olmadığı için sessizce geç
  if (__DEV__ && !Device.isDevice) {
    return null;
  }

  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Varsayılan',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
        sound: './assets/notification_sound.wav',
      });
      
      await Notifications.setNotificationChannelAsync('chat', {
        name: 'Sohbet Bildirimleri',
        description: 'Yeni mesaj bildirimleri',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 100, 200, 300],
        lightColor: '#2196F3',
        sound: './assets/notification_sound.wav',
      });
      
      await Notifications.setNotificationChannelAsync('medical', {
        name: 'Tıbbi Bildirimler',
        description: 'Hekim ataması, muayene ve reçete bildirimleri',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 200, 100, 200],
        lightColor: '#4CAF50',
        sound: './assets/notification_sound.wav',
      });
      
      await Notifications.setNotificationChannelAsync('system', {
        name: 'Sistem Bildirimleri',
        description: 'Sistem bildirimleri ve uyarılar',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 150, 150, 150],
        lightColor: '#FF9800',
        sound: './assets/notification_sound.wav',
      });
      
      await Notifications.setNotificationChannelAsync('urgent', {
        name: 'Acil Bildirimler',
        description: 'Acil durum bildirimleri',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 300, 200, 300, 200, 300],
        lightColor: '#F44336',
        sound: './assets/notification_sound.wav',
      });
      
      await Notifications.setNotificationChannelAsync('reminder', {
        name: 'Hatırlatıcılar',
        description: 'Bekleyen işlemler ve hatırlatıcılar',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 100, 100, 100],
        lightColor: '#9C27B0',
        sound: './assets/notification_sound.wav',
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      try {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      } catch (error) {
        // Expo Go'da hata alabilir, sessizce geç
        return null;
      }
    }

    if (finalStatus !== 'granted') {
      return null;
    }

    try {
      const options = {};
      token = (await Notifications.getExpoPushTokenAsync(options)).data;
    } catch (error) {
      // Expo Go'da push token alınamaz, sessizce geç
      return null;
    }

    return token;
  } catch (error) {
    // Tüm hataları sessizce yakala
    return null;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webviewContainer: {
    flex: 1,
    marginTop: Platform.OS === 'android' ? RNStatusBar.currentHeight : 0,
  },
  webview: {
    flex: 1,
  },
  errorContainer: {
    backgroundColor: '#f8d7da',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f5c6cb',
    paddingTop: Platform.OS === 'android' ? (RNStatusBar.currentHeight + 10) : 40,
  },
  errorText: {
    color: '#721c24',
    textAlign: 'center',
    marginBottom: 5,
  },
  statusBar: {
    padding: 5,
    alignItems: 'center',
  },
  statusConnecting: {
    backgroundColor: '#fff3cd',
  },
  statusError: {
    backgroundColor: '#f8d7da',
  },
  statusDisconnected: {
    backgroundColor: '#f8f9fa',
  },
  statusText: {
    fontSize: 12,
  },
});