import * as Notifications from 'expo-notifications';
import { Alert } from 'react-native';
import { io } from 'socket.io-client';

class SocketService {
  constructor() {
    this.socket = null;
    this.token = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectTimeout = null;
    this.baseUrl = 'https://zylo.vet'; // Socket.IO can use HTTP URLs
    this.wsBaseUrl = 'wss://zylo.vet'; // For direct WebSocket connections
    this.onConnectionError = null;
    this.connectionStatus = 'disconnected';
    this.pingInterval = null;
  }

  // Initialize the Socket with a token
  initialize(token, errorCallback = null) {
    this.token = token;
    this.onConnectionError = errorCallback;
    this.connectionStatus = 'connecting';
    this.connect();
    return this;
  }

  connect() {
    if (!this.token) {
      const message = 'SocketService: No token provided for connection';
      this.handleConnectionError(message);
      return;
    }

    if (this.socket) {
      this.disconnect();
    }

    try {
      this.socket = io(this.baseUrl, {
        auth: { token: this.token },
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 10000,
        forceNew: true,
        rejectUnauthorized: false // SSL sertifika doğrulamasını devre dışı bırak
      });

      this.setupEventListeners();

    } catch (error) {
      const message = `SocketService: Error creating Socket.IO connection: ${error.message}`;
      this.handleConnectionError(message);
    }
  }

  setupEventListeners() {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      this.reconnectAttempts = 0;
      this.connectionStatus = 'connected';
      
      this.sendMessage('client_ready', { platform: 'mobile' });
    });

    // Connection error
    this.socket.on('connect_error', (error) => {
      this.connectionStatus = 'error';
      this.handleConnectionError(`Bağlantı hatası: ${error.message}`);
    });

    this.socket.on('disconnect', (reason) => {
      this.connectionStatus = 'disconnected';
      
      if (reason === 'io server disconnect') {
        this.connect();
      }
    });

    this.socket.io.on('reconnect_attempt', (attempt) => {
      this.connectionStatus = 'connecting';
    });

    this.socket.io.on('reconnect_failed', () => {
      this.connectionStatus = 'error';
      this.handleConnectionError('Sunucuya bağlanılamıyor. Lütfen internet bağlantınızı kontrol edin ve uygulamayı yeniden başlatın.');
    });

    this.socket.io.on('reconnect', (attempt) => {
      this.connectionStatus = 'connected';
    });

    this.socket.on('error', (error) => {
      this.handleConnectionError(`Socket hatası: ${error.message || 'Bilinmeyen hata'}`);
    });

    this.socket.on('auth_error', (data) => {
      const message = 'Yetkilendirme hatası: ' + (data.message || 'Token geçersiz');
      this.handleConnectionError(message);
      
      Alert.alert(
        'Yetkilendirme Hatası',
        'Oturum bilgileri geçersiz. Lütfen tekrar giriş yapın.',
        [{ text: 'Tamam' }]
      );
    });

    this.socket.on('server_ready', (data) => {
      // Server hazır
    });

    this.socket.on('pong', () => {
      // Pong alındı
    });

    this.socket.on('chat:new_message', (data) => {
      
      const senderName = data.message?.sender_name || 
                         data.message?.senderName || 
                         data.sender?.name || 
                         data.senderName || 
                         "Bilinmeyen Kişi";
      
      const messageContent = data.message?.content || 
                             data.content || 
                             data.message || 
                             'Yeni bir mesaj aldınız';
      
      this.showNotification({
        type: 'chat:new_message',
        sender_name: senderName,
        message: messageContent,
        sender: data.sender,
        conversationId: data.conversationId,
        data: data
      });
    });
    
    this.socket.on('chat:messages_read', (data) => {
      // Mesajlar okundu
    });
    
    this.socket.on('notification:new', (data) => {
      this.showNotification({
        type: 'notification:new',
        title: data.title || 'Yeni Bildirim',
        content: data.content || data.message || 'Yeni bir bildiriminiz var',
        data: data
      });
    });

    this.socket.on('notification', (data) => {
      this.showNotification({
        ...data,
        type: data.type || 'notification'
      });
    });
    
    this.socket.on('chat:group_updated', (data) => {
      this.showNotification({
        type: 'chat:group_updated',
        title: 'Grup Güncellemesi',
        body: `"${data.groupName}" grubu güncellendi`,
        data: data
      });
    });
    
    this.socket.on('chat:group_member_added', (data) => {
      this.showNotification({
        type: 'chat:group_member_added',
        title: 'Gruba Eklendiniz',
        body: `"${data.groupName}" grubuna eklendiniz`,
        data: data
      });
    });
    
    this.socket.on('chat:group_member_removed', (data) => {
      this.showNotification({
        type: 'chat:group_member_removed',
        title: 'Gruptan Çıkarıldınız',
        body: `"${data.groupName}" grubundan çıkarıldınız`,
        data: data
      });
    });

    // Enhanced notification system events
    this.socket.on('enhanced_notification', (data) => {
      this.showNotification({
        type: data.type || 'notification',
        title: data.title || 'Yeni Bildirim',
        body: data.message || data.content || 'Yeni bir bildiriminiz var',
        priority: data.priority,
        category: data.category,
        metadata: data.metadata,
        data: data
      });
    });

    // Specific notification types
    this.socket.on('notification:doctor_assignment', (data) => {
      this.showNotification({
        type: 'doctor_assignment',
        title: 'Hekim Ataması',
        body: data.message || `${data.patientName} - ${data.petName} için hekim olarak atandınız`,
        priority: 'high',
        category: 'medical',
        data: data
      });
    });

    this.socket.on('notification:examination_created', (data) => {
      this.showNotification({
        type: 'examination_created',
        title: 'Yeni Muayene',
        body: data.message || `${data.patientName} - ${data.petName} için yeni muayene oluşturuldu`,
        priority: 'medium',
        category: 'medical',
        data: data
      });
    });

    this.socket.on('notification:appointment_created', (data) => {
      this.showNotification({
        type: 'appointment_created',
        title: 'Yeni Randevu',
        body: data.message || `${data.patientName} - ${data.petName} için yeni randevu oluşturuldu`,
        priority: 'medium',
        category: 'administrative',
        data: data
      });
    });

    this.socket.on('notification:product_low_stock', (data) => {
      this.showNotification({
        type: 'product_low_stock',
        title: 'Stok Uyarısı',
        body: data.message || `${data.productName} ürününde stok azalması`,
        priority: 'high',
        category: 'administrative',
        data: data
      });
    });

    this.socket.on('notification:prescription_created', (data) => {
      this.showNotification({
        type: 'prescription_created',
        title: 'Yeni Reçete',
        body: data.message || `${data.patientName} - ${data.petName} için yeni reçete oluşturuldu`,
        priority: 'medium',
        category: 'medical',
        data: data
      });
    });

    this.socket.on('notification:daily_report', (data) => {
      this.showNotification({
        type: 'daily_report',
        title: 'Günlük Rapor',
        body: data.message || 'Günlük aktivite raporu hazır',
        priority: 'low',
        category: 'system',
        data: data
      });
    });

    this.socket.on('notification:pending_prescriptions', (data) => {
      this.showNotification({
        type: 'pending_prescriptions',
        title: 'Bekleyen Reçeteler',
        body: data.message || `${data.count || 'Birkaç'} bekleyen reçete bulunuyor`,
        priority: 'medium',
        category: 'reminder',
        data: data
      });
    });

    this.socket.on('notification:incomplete_examinations', (data) => {
      this.showNotification({
        type: 'incomplete_examinations',
        title: 'Tamamlanmamış Muayeneler',
        body: data.message || `${data.count || 'Birkaç'} tamamlanmamış muayene bulunuyor`,
        priority: 'medium',
        category: 'reminder',
        data: data
      });
    });

    // System notifications
    this.socket.on('notification:system', (data) => {
      this.showNotification({
        type: 'system',
        title: 'Sistem Bildirimi',
        body: data.message || 'Sistem bildirimi',
        priority: data.priority || 'low',
        category: 'system',
        data: data
      });
    });
  }

  handleConnectionError(message) {
    if (this.onConnectionError && typeof this.onConnectionError === 'function') {
      this.onConnectionError(message);
    }
  }

  sendMessage(event, data = {}) {
    if (this.socket && this.socket.connected) {
      try {
        this.socket.emit(event, data);
      } catch (error) {
        // Hataları sessizce yakala
      }
    }
  }

  getConnectionStatus() {
    if (this.socket) {
      if (this.socket.connected) {
        this.connectionStatus = 'connected';
      } else if (this.socket.connecting) {
        this.connectionStatus = 'connecting';
      } else if (!this.socket.connected && !this.socket.connecting) {
        this.connectionStatus = 'disconnected';
      }
    }
    return this.connectionStatus;
  }

  async showNotification(data) {
    try {
      let notificationContent = {
        title: data.title || 'Yeni Bildirim',
        body: data.body || data.content || 'Yeni bir bildiriminiz var',
        data: data,
        sound: './assets/notification_sound.wav',
        badge: 1
      };

      // Bildirim türüne göre özelleştirme
      switch (data.type) {
        case 'chat:new_message':
          const sender = data.sender_name || 'Bilinmeyen Kişi';
          const messageContent = typeof data.message === 'string' 
                            ? data.message 
                            : (data.message?.content || 'Yeni bir mesaj aldınız');
                            
          notificationContent = {
            ...notificationContent,
            title: `${sender} tarafından yeni mesaj`,
            body: messageContent,
            categoryIdentifier: 'chat',
          };
          break;

        case 'doctor_assignment':
          notificationContent = {
            ...notificationContent,
            title: '👨‍⚕️ Hekim Ataması',
            categoryIdentifier: data.priority === 'urgent' ? 'urgent' : 'medical',
            priority: 'high'
          };
          break;

        case 'examination_created':
          notificationContent = {
            ...notificationContent,
            title: '🩺 Yeni Muayene',
            categoryIdentifier: 'medical',
            priority: 'default'
          };
          break;

        case 'appointment_created':
          notificationContent = {
            ...notificationContent,
            title: '📅 Yeni Randevu',
            categoryIdentifier: 'system',
            priority: 'default'
          };
          break;

        case 'product_low_stock':
          notificationContent = {
            ...notificationContent,
            title: '⚠️ Stok Uyarısı',
            categoryIdentifier: data.priority === 'urgent' ? 'urgent' : 'system',
            priority: 'high'
          };
          break;

        case 'prescription_created':
          notificationContent = {
            ...notificationContent,
            title: '💊 Yeni Reçete',
            categoryIdentifier: 'medical',
            priority: 'default'
          };
          break;

        case 'daily_report':
          notificationContent = {
            ...notificationContent,
            title: '📊 Günlük Rapor',
            categoryIdentifier: 'system',
            priority: 'low'
          };
          break;

        case 'pending_prescriptions':
          notificationContent = {
            ...notificationContent,
            title: '⏰ Bekleyen Reçeteler',
            categoryIdentifier: 'reminder',
            priority: 'default'
          };
          break;

        case 'incomplete_examinations':
          notificationContent = {
            ...notificationContent,
            title: '📋 Tamamlanmamış Muayeneler',
            categoryIdentifier: 'reminder',
            priority: 'default'
          };
          break;

        case 'system':
          notificationContent = {
            ...notificationContent,
            title: '⚙️ Sistem Bildirimi',
            categoryIdentifier: data.priority === 'urgent' ? 'urgent' : 'system',
            priority: data.priority === 'urgent' ? 'high' : 'default'
          };
          break;

        case 'notification:new':
        default:
          notificationContent = {
            ...notificationContent,
            title: data.title || '🔔 Yeni Bildirim',
            categoryIdentifier: 'default'
          };
          break;
      }

      // Öncelik seviyesine göre ses ve titreşim ayarları
      if (data.priority === 'urgent' || data.priority === 'high') {
        notificationContent.sound = './assets/notification_sound.wav';
        notificationContent.vibrate = [0, 250, 250, 250];
      } else if (data.priority === 'low') {
        notificationContent.sound = false;
        notificationContent.vibrate = [0, 100];
      }

      await Notifications.scheduleNotificationAsync({
        content: notificationContent,
        trigger: null,
      });
      
      return true;
    } catch (error) {
      return false;
    }
  }

  disconnect() {
    if (this.socket) {
      try {
        this.socket.disconnect();
        this.socket = null;
      } catch (error) {
        // Hataları sessizce yakala
      }
    }
    
    this.connectionStatus = 'disconnected';
  }
}

// Create and export a singleton instance
const socketInstance = new SocketService();
export default socketInstance; 