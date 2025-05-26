import { Platform } from 'react-native';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = 'https://zylo.vet/api';

class ApiService {
  constructor() {
    this.token = null;
  }

  // Set auth token for API requests
  setToken(token) {
    this.token = token;
    this.saveTokenToStorage(token);
    return this;
  }

  // Get the current auth token
  getToken() {
    return this.token;
  }

  // Load token from AsyncStorage if available
  async loadTokenFromStorage() {
    try {
      const token = await AsyncStorage.getItem('authToken');
      if (token) {
        this.token = token;
        return token;
      }
      return null;
    } catch (error) {
      console.error('Error loading token from storage:', error);
      return null;
    }
  }

  // Save token to AsyncStorage
  async saveTokenToStorage(token) {
    try {
      if (token) {
        await AsyncStorage.setItem('authToken', token);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error saving token to storage:', error);
      return false;
    }
  }

  // Clear token from storage (on logout)
  async clearTokenFromStorage() {
    try {
      await AsyncStorage.removeItem('authToken');
      this.token = null;
      return true;
    } catch (error) {
      console.error('Error clearing token from storage:', error);
      return false;
    }
  }

  // Generic fetch wrapper with authentication
  async fetchWithAuth(endpoint, options = {}) {
    if (!this.token) {
      await this.loadTokenFromStorage();
    }

    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers,
      });

      // Check if the response is JSON
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const data = await response.json();
        
        // Handle authentication errors
        if (response.status === 401) {
          // Token expired or invalid
          await this.clearTokenFromStorage();
        }
        
        return { 
          success: response.ok, 
          data, 
          status: response.status 
        };
      }

      return { 
        success: response.ok, 
        data: await response.text(), 
        status: response.status 
      };
    } catch (error) {
      console.error(`API request error (${endpoint}):`, error);
      return { 
        success: false, 
        error: error.message || 'Network request failed', 
        status: 0 
      };
    }
  }

  // Register push notification token with the server
  async registerPushToken(pushToken) {
    if (!this.token || !pushToken) {
      return { success: false, error: 'Missing authentication or push token' };
    }

    const deviceInfo = {
      model: Device.modelName || Platform.OS,
      os: Platform.OS,
      osVersion: Platform.Version,
      deviceName: Device.deviceName || 'Unknown Device',
      appVersion: '1.0.0' // Replace with your app version
    };

    return this.fetchWithAuth('/notifications/register-device', {
      method: 'POST',
      body: JSON.stringify({
        push_token: pushToken,
        device_type: Platform.OS,
        device_info: deviceInfo
      })
    });
  }

  // Send device status ping to server to maintain device activity state
  async sendDeviceStatusPing() {
    return this.fetchWithAuth('/mobile/ping', {
      method: 'POST',
      body: JSON.stringify({
        timestamp: new Date().toISOString(),
        device_active: true,
        app_state: 'background'
      })
    });
  }

  // Get unread notification count
  async getUnreadNotificationCount() {
    return this.fetchWithAuth('/notifications/unread-count', {
      method: 'GET'
    });
  }

  // Mark notifications as read
  async markNotificationsAsRead(notificationIds) {
    return this.fetchWithAuth('/notifications/mark-read', {
      method: 'POST',
      body: JSON.stringify({
        notification_ids: notificationIds
      })
    });
  }
}

export default new ApiService(); 