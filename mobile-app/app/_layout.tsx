// 📁 app/_layout.tsx
// 루트 레이아웃 — 앱 초기화, 알림 권한, 스플래시

import { useEffect } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { NotificationService } from '../services/notifications';
import { StorageService } from '../services/storage';
import { COLORS } from '../constants/theme';
import { StatusBar } from 'expo-status-bar';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useEffect(() => {
    initApp();
  }, []);

  async function initApp() {
    try {
      // 알림 채널 세팅 (Android)
      await NotificationService.setupAndroidChannel();

      // 저장된 알림 설정 불러와서 재등록
      const settings = await StorageService.getSettings();
      if (settings.notificationsEnabled) {
        const granted = await NotificationService.requestPermissions();
        if (granted) {
          const [h, m] = settings.notificationTime.split(':').map(Number);
          await NotificationService.scheduleDailyNotification(h, m);
        }
      }

      // 알림 탭 핸들러 (알림 클릭 → 앱 열기)
      Notifications.addNotificationResponseReceivedListener(response => {
        console.log('[Notification] Tapped:', response.notification.request.content.data);
        // router.push('/(tabs)') 등으로 이동 가능
      });
    } catch (e) {
      console.error('[App Init Error]', e);
    } finally {
      await SplashScreen.hideAsync();
    }
  }

  return (
    <>
      <StatusBar style="light" backgroundColor={COLORS.bgDeep} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: COLORS.bgBase },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="news/[id]"
          options={{
            headerShown: false,
            animation: 'slide_from_bottom',
            presentation: 'modal',
          }}
        />
      </Stack>
    </>
  );
}
