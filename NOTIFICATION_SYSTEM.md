# Zylo Mobil Bildirim Sistemi

Bu dokümantasyon Zylo veteriner yönetim uygulamasının mobil bildirim sistemini açıklar.

## Özellikler

### Desteklenen Bildirim Türleri

1. **Hekim Ataması** (`doctor_assignment`)
   - Bir hastaya hekim atandığında gönderilir
   - Yüksek öncelik
   - Tıbbi kategori

2. **Yeni Muayene** (`examination_created`)
   - Yeni muayene oluşturulduğunda gönderilir
   - Orta öncelik
   - Tıbbi kategori

3. **Yeni Randevu** (`appointment_created`)
   - Yeni randevu oluşturulduğunda gönderilir
   - Orta öncelik
   - İdari kategori

4. **Stok Uyarısı** (`product_low_stock`)
   - Ürün stoğu azaldığında gönderilir
   - Yüksek öncelik
   - İdari kategori

5. **Yeni Reçete** (`prescription_created`)
   - Yeni reçete oluşturulduğunda gönderilir
   - Orta öncelik
   - Tıbbi kategori

6. **Günlük Rapor** (`daily_report`)
   - Günlük aktivite raporu hazır olduğunda gönderilir
   - Düşük öncelik
   - Sistem kategori

7. **Bekleyen Reçeteler** (`pending_prescriptions`)
   - Bekleyen reçeteler hatırlatması
   - Orta öncelik
   - Hatırlatıcı kategori

8. **Tamamlanmamış Muayeneler** (`incomplete_examinations`)
   - Tamamlanmamış muayeneler hatırlatması
   - Orta öncelik
   - Hatırlatıcı kategori

### Bildirim Kanalları

Android cihazlarda aşağıdaki bildirim kanalları kullanılır:

- **default**: Varsayılan bildirimler
- **chat**: Sohbet bildirimleri
- **medical**: Tıbbi bildirimler
- **system**: Sistem bildirimleri
- **urgent**: Acil bildirimler
- **reminder**: Hatırlatıcılar

### Öncelik Seviyeleri

- **urgent**: Acil (maksimum titreşim ve ses)
- **high**: Yüksek (normal titreşim ve ses)
- **medium**: Orta (normal titreşim ve ses)
- **low**: Düşük (minimal titreşim, sessiz)

## Teknik Detaylar

### Servisler

1. **WebSocketService**: Socket.IO bağlantısı ve bildirim event'lerini dinler
2. **EnhancedNotificationService**: Bildirim yönetimi ve API çağrıları
3. **ApiService**: Push token kaydı ve API işlemleri

### Event Listener'lar

WebSocketService aşağıdaki event'leri dinler:

```javascript
// Genel bildirim event'leri
'notification:new'
'enhanced_notification'

// Spesifik bildirim türleri
'notification:doctor_assignment'
'notification:examination_created'
'notification:appointment_created'
'notification:product_low_stock'
'notification:prescription_created'
'notification:daily_report'
'notification:pending_prescriptions'
'notification:incomplete_examinations'
'notification:system'
```

### Push Token Kaydı

Uygulama başlatıldığında:
1. Expo push token alınır
2. Backend'e kayıt edilir
3. Socket bağlantısı kurulduğunda enhanced notification service başlatılır

### Bildirim Gösterimi

Her bildirim türü için özelleştirilmiş:
- Başlık ve içerik
- Emoji ikonları
- Uygun bildirim kanalı
- Öncelik seviyesine göre ses ve titreşim

## Kullanım

### Bildirim Ayarları

```javascript
// Bildirim ayarlarını getir
const settings = await enhancedNotificationService.getNotificationSettings();

// Bildirim ayarını güncelle
await enhancedNotificationService.updateNotificationSettings('doctor_assignment', {
  enabled: true,
  push_enabled: true,
  sound_enabled: true
});
```

### Bildirimleri Yönetme

```javascript
// Bildirimleri getir
const notifications = await enhancedNotificationService.getNotifications(20, 0);

// Bildirimi okundu işaretle
await enhancedNotificationService.markAsRead(notificationId);

// Tümünü okundu işaretle
await enhancedNotificationService.markAllAsRead();

// Toplu işaretleme
await enhancedNotificationService.markBulkAsRead('category', 'medical');
```

### Event Listener'lar

```javascript
// Okunmamış sayı değişikliği
const unsubscribe = enhancedNotificationService.addListener(
  'unread_count_changed', 
  (count) => {
    console.log('Okunmamış bildirim sayısı:', count);
  }
);

// Yeni bildirim alındığında
enhancedNotificationService.addListener(
  'notification_received', 
  (data) => {
    console.log('Yeni bildirim:', data);
  }
);
```

## Kurulum

Gerekli paketler zaten yüklü:
- expo-notifications
- socket.io-client
- @react-native-async-storage/async-storage

Bildirim sistemi otomatik olarak başlatılır ve kullanıcı giriş yaptığında aktif hale gelir. 