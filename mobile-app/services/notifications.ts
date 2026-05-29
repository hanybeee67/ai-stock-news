// 📁 services/notifications.ts
// 로컬 푸시 알림 서비스 (외부 푸시 서버 없이 디바이스 자체 스케줄링)

import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

// 백그라운드 패치 태스크 이름
export const BACKGROUND_FETCH_TASK = 'ai-stock-background-fetch';

// 알림 채널 설정 (Android)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export const NotificationService = {

  /** 알림 권한 요청 */
  async requestPermissions(): Promise<boolean> {
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === 'granted') return true;

    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  },

  /** Android 전용 알림 채널 생성 */
  async setupAndroidChannel(): Promise<void> {
    if (Platform.OS !== 'android') return;
    await Notifications.setNotificationChannelAsync('daily-briefing', {
      name: '🌅 AI 아침 증시 브리핑',
      description: '매일 아침 AI가 분석한 글로벌 증시 핵심 뉴스를 알려드립니다.',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 300, 200, 300],
      lightColor: '#4F6EF7',
      sound: 'default',
      enableVibrate: true,
      showBadge: true,
    });
  },

  /**
   * 매일 특정 시간에 발송될 로컬 알림 스케줄링
   * @param hour   발송 시각 (시) - 기본 8
   * @param minute 발송 시각 (분) - 기본 0
   */
  async scheduleDailyNotification(hour: number = 8, minute: number = 0): Promise<string> {
    // 기존 스케줄된 알림 모두 취소 후 재등록
    await Notifications.cancelAllScheduledNotificationsAsync();

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: '📊 오늘 아침 AI 증시 브리핑 도착!',
        body: '지금 확인하세요 → 오늘의 숨은 수혜주 & 글로벌 핵심 뉴스 3분 리포트',
        data: { type: 'daily_briefing', openScreen: 'dashboard' },
        sound: 'default',
        badge: 1,
        color: '#4F6EF7',
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: {
        hour,
        minute,
        repeats: true, // 매일 반복
        channelId: 'daily-briefing',
      } as any,
    });

    return id;
  },

  /** 즉시 테스트 알림 발송 */
  async sendTestNotification(): Promise<void> {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '✅ 알림 설정 완료!',
        body: '매일 설정하신 시간에 AI 증시 브리핑을 보내드립니다.',
        data: { type: 'test' },
        color: '#22D3A0',
      },
      trigger: { seconds: 2 } as any,
    });
  },

  /** 모든 예약 알림 취소 */
  async cancelAll(): Promise<void> {
    await Notifications.cancelAllScheduledNotificationsAsync();
  },

  /** 예약된 알림 목록 조회 */
  async getScheduled(): Promise<Notifications.NotificationRequest[]> {
    return Notifications.getAllScheduledNotificationsAsync();
  },
};
