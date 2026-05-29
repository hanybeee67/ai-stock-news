// 📁 app/(tabs)/settings.tsx
// 설정 화면 — 알림 시간 설정, 관심 카테고리 필터, API 엔드포인트

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  TextInput,
  Alert,
  Platform,
  StatusBar,
} from 'react-native';
import { AppSettings } from '../../types';
import { StorageService, DEFAULT_SETTINGS } from '../../services/storage';
import { NotificationService } from '../../services/notifications';
import { ApiService } from '../../services/api';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

const ALL_CATEGORIES = [
  '반도체', '바이오', '2차전지', '매크로', '에너지',
  '방위산업', '원자재', '공급망', '부동산', '기술', '식품/농업', '금융',
];

// 시간 선택 프리셋
const TIME_PRESETS = [
  { label: '오전 6시', value: '06:00' },
  { label: '오전 7시', value: '07:00' },
  { label: '오전 8시', value: '08:00' },
  { label: '오전 9시', value: '09:00' },
];

export default function SettingsScreen() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  useEffect(() => {
    StorageService.getSettings().then(setSettings);
    checkServer();
  }, []);

  const checkServer = async () => {
    setServerStatus('checking');
    const ok = await ApiService.checkHealth();
    setServerStatus(ok ? 'online' : 'offline');
  };

  const updateSetting = async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    await StorageService.saveSettings({ [key]: value });
  };

  const toggleCategory = async (cat: string) => {
    const current = settings.selectedCategories;
    const updated = current.includes(cat)
      ? current.filter(c => c !== cat)
      : [...current, cat];
    await updateSetting('selectedCategories', updated);
  };

  const applyNotificationTime = async (time: string) => {
    await updateSetting('notificationTime', time);
    if (settings.notificationsEnabled) {
      const [h, m] = time.split(':').map(Number);
      await NotificationService.scheduleDailyNotification(h, m);
      Alert.alert('✅ 알림 설정 완료', `매일 ${time}에 AI 증시 브리핑을 보내드립니다.`);
    }
  };

  const toggleNotifications = async (value: boolean) => {
    await updateSetting('notificationsEnabled', value);
    if (value) {
      const granted = await NotificationService.requestPermissions();
      if (!granted) {
        Alert.alert('권한 필요', '알림 권한이 없습니다. 기기 설정에서 허용해주세요.');
        await updateSetting('notificationsEnabled', false);
        return;
      }
      await NotificationService.setupAndroidChannel();
      const [h, m] = settings.notificationTime.split(':').map(Number);
      await NotificationService.scheduleDailyNotification(h, m);
    } else {
      await NotificationService.cancelAll();
    }
  };

  const sendTestNotification = async () => {
    const granted = await NotificationService.requestPermissions();
    if (!granted) {
      Alert.alert('권한 필요', '알림 권한을 허용해주세요.');
      return;
    }
    await NotificationService.sendTestNotification();
    Alert.alert('📬 테스트 알림', '2초 후 알림이 도착합니다!');
  };

  const resetData = () => {
    Alert.alert(
      '데이터 초기화',
      '저장된 모든 뉴스와 리포트가 삭제됩니다. 계속하시겠습니까?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '초기화',
          style: 'destructive',
          onPress: async () => {
            await StorageService.clearAll();
            setSettings(DEFAULT_SETTINGS);
            Alert.alert('완료', '데이터가 초기화되었습니다.');
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* 헤더 */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>⚙️ 설정</Text>
        <Text style={styles.headerSubtitle}>나만의 AI 증시 브리핑 커스터마이즈</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ── 알림 설정 섹션 ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🔔 아침 알림 설정</Text>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>AI 브리핑 알림 받기</Text>
              <Text style={styles.settingDesc}>매일 설정한 시간에 로컬 알림 발송</Text>
            </View>
            <Switch
              value={settings.notificationsEnabled}
              onValueChange={toggleNotifications}
              trackColor={{ false: COLORS.bgSurface, true: COLORS.primary + '80' }}
              thumbColor={settings.notificationsEnabled ? COLORS.primary : COLORS.textMuted}
              ios_backgroundColor={COLORS.bgSurface}
            />
          </View>

          {settings.notificationsEnabled && (
            <>
              <Text style={styles.subLabel}>알림 시간 선택</Text>
              <View style={styles.timePresets}>
                {TIME_PRESETS.map(preset => (
                  <TouchableOpacity
                    key={preset.value}
                    style={[
                      styles.timeChip,
                      settings.notificationTime === preset.value && styles.timeChipActive,
                    ]}
                    onPress={() => applyNotificationTime(preset.value)}
                  >
                    <Text style={[
                      styles.timeChipText,
                      settings.notificationTime === preset.value && styles.timeChipTextActive,
                    ]}>
                      {preset.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity style={styles.testBtn} onPress={sendTestNotification}>
                <Text style={styles.testBtnText}>📬 테스트 알림 발송</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* ── 관심 카테고리 섹션 ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🏷️ 관심 카테고리</Text>
          <Text style={styles.sectionSubtitle}>선택한 카테고리의 뉴스를 우선 표시합니다</Text>

          <View style={styles.categoryGrid}>
            {ALL_CATEGORIES.map(cat => {
              const active = settings.selectedCategories.includes(cat);
              return (
                <TouchableOpacity
                  key={cat}
                  style={[styles.catChip, active && styles.catChipActive]}
                  onPress={() => toggleCategory(cat)}
                >
                  <Text style={[styles.catChipText, active && styles.catChipTextActive]}>
                    {cat}
                  </Text>
                  {active && <Text style={styles.catCheck}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.selectedCount}>
            {settings.selectedCategories.length}개 카테고리 선택됨
          </Text>
        </View>

        {/* ── 서버 연결 섹션 ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🖥️ 백엔드 연결</Text>

          <View style={styles.serverStatusRow}>
            <View style={[
              styles.statusDot,
              {
                backgroundColor: serverStatus === 'online' ? COLORS.accentGreen
                  : serverStatus === 'offline' ? COLORS.accentRed
                  : COLORS.accentGold,
              }
            ]} />
            <Text style={styles.statusLabel}>
              {serverStatus === 'online' ? '서버 연결됨 ✓' :
               serverStatus === 'offline' ? '서버 오프라인 (Mock 데이터 사용 중)' :
               '연결 확인 중...'}
            </Text>
            <TouchableOpacity style={styles.refreshBtn} onPress={checkServer}>
              <Text style={styles.refreshBtnText}>↻</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.subLabel}>API 서버 주소</Text>
          <TextInput
            style={styles.apiInput}
            value={settings.apiEndpoint}
            onChangeText={val => updateSetting('apiEndpoint', val)}
            onBlur={() => {
              ApiService.resetClient();
              checkServer();
            }}
            placeholder="http://localhost:8000"
            placeholderTextColor={COLORS.textMuted}
            autoCapitalize="none"
            keyboardType="url"
          />
          <Text style={styles.apiHint}>
            💡 Python 백엔드를 로컬에서 실행 후 PC IP를 입력하세요{'\n'}
            예: http://192.168.1.100:8000
          </Text>
        </View>

        {/* ── 앱 정보 & 데이터 관리 ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ℹ️ 앱 정보</Text>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>버전</Text>
            <Text style={styles.infoValue}>v1.0.0</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>마지막 갱신</Text>
            <Text style={styles.infoValue}>
              {settings.lastFetchedAt
                ? new Date(settings.lastFetchedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
                : '아직 갱신 없음'}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>AI 엔진</Text>
            <Text style={styles.infoValue}>Claude 3.5 Sonnet</Text>
          </View>

          <TouchableOpacity style={styles.dangerBtn} onPress={resetData}>
            <Text style={styles.dangerBtnText}>🗑️ 모든 데이터 초기화</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: SPACING.xxxl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgBase },
  header: {
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: SPACING.base,
    paddingHorizontal: SPACING.base,
    backgroundColor: COLORS.bgBase,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderCard,
  },
  headerTitle: {
    fontSize: FONTS.xxl,
    fontWeight: FONTS.extrabold,
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  headerSubtitle: { fontSize: FONTS.sm, color: COLORS.textMuted },

  scroll: { flex: 1 },
  scrollContent: { padding: SPACING.base },

  section: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.xl,
    padding: SPACING.base,
    marginBottom: SPACING.base,
    borderWidth: 1,
    borderColor: COLORS.borderCard,
  },
  sectionTitle: {
    fontSize: FONTS.base,
    fontWeight: FONTS.bold,
    color: COLORS.textPrimary,
    marginBottom: SPACING.xs,
  },
  sectionSubtitle: {
    fontSize: FONTS.sm,
    color: COLORS.textMuted,
    marginBottom: SPACING.base,
  },

  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
  },
  settingInfo: { flex: 1, paddingRight: SPACING.base },
  settingLabel: { fontSize: FONTS.md, color: COLORS.textPrimary, fontWeight: FONTS.medium },
  settingDesc: { fontSize: FONTS.sm, color: COLORS.textMuted, marginTop: 2 },

  subLabel: {
    fontSize: FONTS.sm,
    color: COLORS.textSecondary,
    fontWeight: FONTS.semibold,
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
  },

  timePresets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.base,
  },
  timeChip: {
    paddingHorizontal: SPACING.base,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.bgSurface,
    borderWidth: 1,
    borderColor: COLORS.borderCard,
  },
  timeChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  timeChipText: { fontSize: FONTS.sm, color: COLORS.textMuted, fontWeight: FONTS.medium },
  timeChipTextActive: { color: COLORS.white, fontWeight: FONTS.bold },

  testBtn: {
    backgroundColor: COLORS.bgSurface,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.primary + '40',
  },
  testBtnText: { fontSize: FONTS.sm, color: COLORS.primary, fontWeight: FONTS.semibold },

  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.bgSurface,
    borderWidth: 1,
    borderColor: COLORS.borderCard,
  },
  catChipActive: {
    backgroundColor: COLORS.primary + '25',
    borderColor: COLORS.primary + '60',
  },
  catChipText: { fontSize: FONTS.sm, color: COLORS.textMuted, fontWeight: FONTS.medium },
  catChipTextActive: { color: COLORS.primary, fontWeight: FONTS.bold },
  catCheck: { fontSize: 10, color: COLORS.primary },
  selectedCount: {
    fontSize: FONTS.xs,
    color: COLORS.primary,
    fontWeight: FONTS.semibold,
    textAlign: 'right',
  },

  serverStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.bgSurface,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { flex: 1, fontSize: FONTS.sm, color: COLORS.textSecondary },
  refreshBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshBtnText: { fontSize: FONTS.base, color: COLORS.primary, fontWeight: FONTS.bold },

  apiInput: {
    backgroundColor: COLORS.bgSurface,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    fontSize: FONTS.sm,
    color: COLORS.textPrimary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    borderWidth: 1,
    borderColor: COLORS.borderCard,
    marginBottom: SPACING.xs,
  },
  apiHint: {
    fontSize: FONTS.xs,
    color: COLORS.textMuted,
    lineHeight: 16,
  },

  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: SPACING.xs,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  infoLabel: { fontSize: FONTS.sm, color: COLORS.textMuted },
  infoValue: { fontSize: FONTS.sm, color: COLORS.textSecondary, fontWeight: FONTS.medium },

  dangerBtn: {
    backgroundColor: COLORS.dangerBg,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.danger + '40',
    marginTop: SPACING.base,
  },
  dangerBtnText: { fontSize: FONTS.sm, color: COLORS.danger, fontWeight: FONTS.semibold },
});
