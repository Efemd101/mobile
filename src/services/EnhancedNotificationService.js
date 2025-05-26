import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import socketInstance from './WebSocketService';
import apiService from './ApiService';

class EnhancedNotificationService {
  constructor() {
    this.isInitialized = false;
    this.notificationListeners = [];
    this.unreadCount = 0;
  }

  // Servisi başlat
  async initialize() {
    if (this.isInitialized) return;

    try {
      // Bildirim izinlerini kontrol et
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') {
        return false;
      }

      // Socket event listener'larını ekle
      this.setupSocketListeners();
      
      // Okunmamış bildirim sayısını al
      await this.updateUnreadCount();

      this.isInitialized = true;
      return true;
    } catch (error) {
      return false;
    }
  }

  // Socket event listener'larını ayarla
  setupSocketListeners() {
    if (!socketInstance.socket) return;

    // Yeni bildirim geldiğinde okunmamış sayıyı güncelle
    socketInstance.socket.on('notification:new', () => {
      this.updateUnreadCount();
    });

    socketInstance.socket.on('enhanced_notification', (data) => {
      this.updateUnreadCount();
      this.notifyListeners('notification_received', data);
    });

    // Diğer bildirim türleri için listener'lar
    const notificationTypes = [
      'notification:doctor_assignment',
      'notification:examination_created', 
      'notification:appointment_created',
      'notification:product_low_stock',
      'notification:prescription_created',
      'notification:daily_report',
      'notification:pending_prescriptions',
      'notification:incomplete_examinations',
      'notification:system'
    ];

    notificationTypes.forEach(type => {
      socketInstance.socket.on(type, (data) => {
        this.updateUnreadCount();
        this.notifyListeners('notification_received', { type, ...data });
      });
    });
  }

  // Okunmamış bildirim sayısını güncelle
  async updateUnreadCount() {
    try {
      if (!socketInstance.socket) return;

      socketInstance.socket.emit('notification:get_count', {}, (response) => {
        if (response?.success) {
          this.unreadCount = response.count || 0;
          this.notifyListeners('unread_count_changed', this.unreadCount);
          
          // App badge'ini güncelle
          this.updateAppBadge(this.unreadCount);
        }
      });
    } catch (error) {
      // Hataları sessizce yakala
    }
  }

  // App badge'ini güncelle
  async updateAppBadge(count) {
    try {
      await Notifications.setBadgeCountAsync(count);
    } catch (error) {
      // Hataları sessizce yakala
    }
  }

  // Bildirimleri getir
  async getNotifications(limit = 20, offset = 0, filters = {}) {
    return new Promise((resolve) => {
      if (!socketInstance.socket) {
        resolve({ success: false, error: 'Socket bağlantısı yok' });
        return;
      }

      socketInstance.socket.emit('notification:get_enhanced', 
        { limit, offset, filters }, 
        (response) => {
          resolve(response);
        }
      );
    });
  }

  // Bildirim ayarlarını getir
  async getNotificationSettings() {
    return new Promise((resolve) => {
      if (!socketInstance.socket) {
        resolve({ success: false, error: 'Socket bağlantısı yok' });
        return;
      }

      socketInstance.socket.emit('notification:get_settings', {}, (response) => {
        resolve(response);
      });
    });
  }

  // Bildirim ayarlarını güncelle
  async updateNotificationSettings(type, settings) {
    return new Promise((resolve) => {
      if (!socketInstance.socket) {
        resolve({ success: false, error: 'Socket bağlantısı yok' });
        return;
      }

      socketInstance.socket.emit('notification:update_settings', 
        { type, ...settings }, 
        (response) => {
          resolve(response);
        }
      );
    });
  }

  // Bildirimi okundu olarak işaretle
  async markAsRead(notificationId) {
    return new Promise((resolve) => {
      if (!socketInstance.socket) {
        resolve({ success: false, error: 'Socket bağlantısı yok' });
        return;
      }

      socketInstance.socket.emit('notification:mark_read', 
        { notificationId }, 
        (response) => {
          if (response?.success) {
            this.updateUnreadCount();
          }
          resolve(response);
        }
      );
    });
  }

  // Tüm bildirimleri okundu olarak işaretle
  async markAllAsRead() {
    return new Promise((resolve) => {
      if (!socketInstance.socket) {
        resolve({ success: false, error: 'Socket bağlantısı yok' });
        return;
      }

      socketInstance.socket.emit('notification:mark_all_read', {}, (response) => {
        if (response?.success) {
          this.updateUnreadCount();
        }
        resolve(response);
      });
    });
  }

  // Toplu işaretleme
  async markBulkAsRead(filterType, filterValue) {
    return new Promise((resolve) => {
      if (!socketInstance.socket) {
        resolve({ success: false, error: 'Socket bağlantısı yok' });
        return;
      }

      const filterData = {};
      filterData[filterType] = filterValue;

      socketInstance.socket.emit('notification:mark_bulk_read', 
        filterData, 
        (response) => {
          if (response?.success) {
            this.updateUnreadCount();
          }
          resolve(response);
        }
      );
    });
  }

  // Push token'ı kaydet
  async registerPushToken(pushToken, deviceType = Platform.OS) {
    return new Promise((resolve) => {
      if (!socketInstance.socket) {
        resolve({ success: false, error: 'Socket bağlantısı yok' });
        return;
      }

      socketInstance.socket.emit('notification:register_push_token', 
        { pushToken, deviceType }, 
        (response) => {
          resolve(response);
        }
      );
    });
  }



  // Event listener ekle
  addListener(eventType, callback) {
    const listener = { eventType, callback };
    this.notificationListeners.push(listener);
    
    return () => {
      const index = this.notificationListeners.indexOf(listener);
      if (index > -1) {
        this.notificationListeners.splice(index, 1);
      }
    };
  }

  // Listener'ları bilgilendir
  notifyListeners(eventType, data) {
    this.notificationListeners
      .filter(listener => listener.eventType === eventType)
      .forEach(listener => {
        try {
          listener.callback(data);
        } catch (error) {
          // Hataları sessizce yakala
        }
      });
  }

  // Okunmamış bildirim sayısını al
  getUnreadCount() {
    return this.unreadCount;
  }

  // Servisi temizle
  cleanup() {
    this.notificationListeners = [];
    this.isInitialized = false;
    this.unreadCount = 0;
  }
}

// Singleton instance oluştur ve export et
const enhancedNotificationService = new EnhancedNotificationService();
export default enhancedNotificationService; 