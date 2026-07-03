// 📁 app/_layout.tsx
// 루트 레이아웃 — 앱 초기화 + 화려한 인트로 스플래시 (투자 주의 경고 포함)

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  ScrollView,
  Dimensions,
  Platform,
  StatusBar as RNStatusBar,
} from 'react-native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { LinearGradient } from 'expo-linear-gradient';
import { NotificationService } from '../services/notifications';
import { StorageService } from '../services/storage';
import { COLORS, FONTS, SPACING, RADIUS } from '../constants/theme';
import { StatusBar } from 'expo-status-bar';

SplashScreen.preventAutoHideAsync();

const { width, height } = Dimensions.get('window');

// ── 파티클 장식 원 ──────────────────────────────────────────────────
const PARTICLES = [
  { size: 180, top: -60, right: -50, opacity: 0.08, color: '#4F6EF7' },
  { size: 120, top: 80, left: -40, opacity: 0.06, color: '#A855F7' },
  { size: 200, bottom: 100, right: -80, opacity: 0.07, color: '#4F6EF7' },
  { size: 90, bottom: 200, left: 20, opacity: 0.05, color: '#22D3A0' },
  { size: 60, top: height * 0.35, right: 30, opacity: 0.1, color: '#FF8C42' },
];

export default function RootLayout() {
  const [appReady, setAppReady] = useState(false);
  const [showIntro, setShowIntro] = useState(true); // 처음부터 인트로 오버레이 표시
  const [introStep, setIntroStep] = useState<'logo' | 'disclaimer' | 'done'>('logo');

  // 애니메이션 값들
  const bgAnim   = useRef(new Animated.Value(0)).current;
  const logoAnim = useRef(new Animated.Value(0)).current;
  const logoScale= useRef(new Animated.Value(0.6)).current;
  const tagAnim  = useRef(new Animated.Value(0)).current;
  const discAnim = useRef(new Animated.Value(0)).current;
  const btnAnim  = useRef(new Animated.Value(0)).current;
  const pulseAnim= useRef(new Animated.Value(1)).current;
  const exitAnim = useRef(new Animated.Value(1)).current;

  // 로고 펄스 반복
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.06, duration: 1800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.0,  duration: 1800, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // 앱 초기화
  useEffect(() => {
    initApp();
  }, []);

  async function initApp() {
    try {
      await NotificationService.setupAndroidChannel();
      const settings = await StorageService.getSettings();
      if (settings.notificationsEnabled) {
        const granted = await NotificationService.requestPermissions();
        if (granted) {
          const [h, m] = settings.notificationTime.split(':').map(Number);
          await NotificationService.scheduleDailyNotification(h, m);
        }
      }
      Notifications.addNotificationResponseReceivedListener(response => {
        console.log('[Notification] Tapped:', response.notification.request.content.data);
      });
    } catch (e) {
      console.error('[App Init Error]', e);
    } finally {
      setAppReady(true);
      // 인트로 오버레이가 먼저 렌더된 뒤에 스플래시 숨김 (흰화면 방지)
      setTimeout(async () => {
        await SplashScreen.hideAsync();
        startIntroAnimation();
      }, 50);
    }
  }

  function startIntroAnimation() {
    // 1단계: 배경 페이드 + 로고 등장
    Animated.parallel([
      Animated.timing(bgAnim,    { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(logoScale, { toValue: 1, friction: 5, tension: 60, useNativeDriver: true }),
      Animated.timing(logoAnim,  { toValue: 1, duration: 700, delay: 200, useNativeDriver: true }),
    ]).start(() => {
      // 2단계: 태그라인 등장
      Animated.timing(tagAnim, { toValue: 1, duration: 500, delay: 300, useNativeDriver: true }).start(() => {
        // 3단계: 투자 주의 경고 등장
        setIntroStep('disclaimer');
        Animated.parallel([
          Animated.timing(discAnim, { toValue: 1, duration: 600, delay: 200, useNativeDriver: true }),
          Animated.timing(btnAnim,  { toValue: 1, duration: 500, delay: 700, useNativeDriver: true }),
        ]).start();
      });
    });
  }

  function handleAgree() {
    // 화면 페이드 아웃 후 메인 진입
    Animated.timing(exitAnim, { toValue: 0, duration: 500, useNativeDriver: true }).start(() => {
      setShowIntro(false);
    });
  }


  // ── 메인 앱 + 인트로 오버레이 ────────────────────────────────────────

  return (
    <View style={{ flex: 1, backgroundColor: '#03071A' }}>
      {/* 메인 앱은 항상 렌더 (인트로 뒤에 미리 로드) */}
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

      {/* 인트로 오버레이: showIntro일 때만 위에 덮음 */}
      {showIntro && (
        <Animated.View
          style={[
            styles.introWrapper,
            StyleSheet.absoluteFillObject,
            { opacity: exitAnim, backgroundColor: '#03071A' }, // 처음부터 불투명 어두운 배경
          ]}
          pointerEvents={showIntro ? 'auto' : 'none'}
        >
          <RNStatusBar barStyle="light-content" backgroundColor={'#03071A'} />

          {/* 배경 그라디언트 */}
          <LinearGradient
            colors={['#03071A', '#060D2E', '#0A0E1A']}
            locations={[0, 0.5, 1]}
            style={StyleSheet.absoluteFillObject}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.8, y: 1 }}
          />

          {/* 파티클 장식 */}
          {PARTICLES.map((p, i) => (
            <Animated.View
              key={i}
              style={[
                styles.particle,
                {
                  width: p.size, height: p.size, borderRadius: p.size / 2,
                  backgroundColor: p.color,
                  opacity: p.opacity,
                  ...(p.top    !== undefined ? { top: p.top }       : {}),
                  ...(p.bottom !== undefined ? { bottom: p.bottom } : {}),
                  ...(p.left   !== undefined ? { left: p.left }     : {}),
                  ...(p.right  !== undefined ? { right: p.right }   : {}),
                },
                { transform: [{ scale: bgAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }] },
              ]}
            />
          ))}

          {/* 그리드 라인 장식 */}
          <View style={styles.gridOverlay}>
            {[...Array(8)].map((_, i) => (
              <View key={i} style={styles.gridLine} />
            ))}
          </View>

          {/* 스크롤 가능 콘텐츠 */}
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* 로고 & 타이틀 영역 */}
            <View style={styles.logoArea}>
              <Animated.View
                style={[
                  styles.logoBox,
                  {
                    opacity: logoAnim,
                    transform: [
                      { scale: Animated.multiply(logoScale, pulseAnim) },
                      { translateY: logoAnim.interpolate({ inputRange: [0, 1], outputRange: [-30, 0] }) },
                    ],
                  },
                ]}
              >
                <LinearGradient
                  colors={['#4F6EF7', '#A855F7']}
                  style={styles.logoGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Text style={styles.logoEmoji}>✈️</Text>
                </LinearGradient>
                <View style={styles.glowRing1} />
                <View style={styles.glowRing2} />
              </Animated.View>

              <Animated.View
                style={{
                  opacity: logoAnim,
                  transform: [{ translateY: logoAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
                }}
              >
                <Text style={styles.appName}>StockFly</Text>
                <Text style={styles.appNameSub}>STOCKFLY AI</Text>
              </Animated.View>

              <Animated.View style={[styles.divider, { opacity: tagAnim, scaleX: tagAnim }]}>
                <LinearGradient
                  colors={['transparent', '#4F6EF7', 'transparent']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={StyleSheet.absoluteFillObject}
                />
              </Animated.View>

              <Animated.View
                style={{
                  opacity: tagAnim,
                  transform: [{ translateY: tagAnim.interpolate({ inputRange: [0, 1], outputRange: [15, 0] }) }],
                }}
              >
                <Text style={styles.tagline}>전 세계 뉴스 → 나비효과 분석</Text>
                <Text style={styles.taglineSub}>⏱ 오늘 아침 딱 3분 리포트</Text>
              </Animated.View>

              <Animated.View style={[styles.featureBadges, { opacity: tagAnim }]}>
                {['🌐 글로벌 뉴스', '🤖 AI 분석', '📈 수혜주'].map((f, i) => (
                  <View key={i} style={styles.featureBadge}>
                    <Text style={styles.featureBadgeText}>{f}</Text>
                  </View>
                ))}
              </Animated.View>
            </View>

            {/* 투자 주의 경고 */}
            <Animated.View
              style={[
                styles.disclaimerArea,
                {
                  opacity: discAnim,
                  transform: [{ translateY: discAnim.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }],
                },
              ]}
            >
              <View style={styles.disclaimerCard}>
                <LinearGradient
                  colors={['rgba(245,200,66,0.18)', 'rgba(245,200,66,0.06)']}
                  style={styles.disclaimerHeader}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <View style={styles.disclaimerHeaderLeft}>
                    <View style={styles.warningIconBox}>
                      <Text style={styles.warningIcon}>⚠️</Text>
                    </View>
                    <View>
                      <Text style={styles.disclaimerTitle}>투자 유의사항</Text>
                      <Text style={styles.disclaimerTitleSub}>Investment Disclaimer</Text>
                    </View>
                  </View>
                  <View style={styles.disclaimerBadge}>
                    <Text style={styles.disclaimerBadgeText}>필독</Text>
                  </View>
                </LinearGradient>

                <View style={styles.disclaimerBody}>
                  <Text style={styles.disclaimerText}>
                    본 앱의 모든 분석은{' '}
                    <Text style={styles.disclaimerHighlight}>투자 참고용</Text>
                    이며{'\n'}투자 권유가 아닙니다.
                  </Text>
                  <Text style={styles.disclaimerText2}>
                    투자 손실에 대한 책임은{' '}
                    <Text style={styles.disclaimerHighlight}>투자자 본인</Text>
                    에게 있습니다.
                  </Text>
                  <View style={styles.disclaimerList}>
                    {[
                      '주식 투자는 원금 손실 위험이 있습니다',
                      'AI 분석은 100% 정확하지 않을 수 있습니다',
                      '과거 실적이 미래를 보장하지 않습니다',
                    ].map((item, i) => (
                      <View key={i} style={styles.disclaimerListItem}>
                        <View style={styles.disclaimerDot} />
                        <Text style={styles.disclaimerListText}>{item}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>

              <Animated.View style={{ opacity: btnAnim, transform: [{ scale: btnAnim }] }}>
                <TouchableOpacity
                  style={styles.agreeBtn}
                  onPress={handleAgree}
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={['#4F6EF7', '#7B54F5']}
                    style={styles.agreeBtnGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    <Text style={styles.agreeBtnText}>✅  내용을 확인했습니다</Text>
                  </LinearGradient>
                </TouchableOpacity>
                <Text style={styles.agreeHint}>위 내용에 동의하고 StockFly를 시작합니다</Text>
              </Animated.View>
            </Animated.View>

            <View style={{ height: 32 }} />
          </ScrollView>
        </Animated.View>
      )}
    </View>
  );
}


const styles = StyleSheet.create({
  // ── 인트로 래퍼 ──
  introWrapper: {
    flex: 1,
    backgroundColor: '#03071A',
    paddingTop: Platform.OS === 'ios' ? 60 : (RNStatusBar.currentHeight ?? 30) + 10,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: SPACING.base,
    paddingBottom: Platform.OS === 'ios' ? 44 : 28,
    justifyContent: 'space-between',
    minHeight: height - (Platform.OS === 'ios' ? 60 : (RNStatusBar.currentHeight ?? 30) + 10),
  },

  // ── 파티클 & 그리드 ──
  particle: {
    position: 'absolute',
  },
  gridOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'column',
    justifyContent: 'space-around',
    opacity: 0.03,
  },
  gridLine: {
    width: '100%',
    height: 1,
    backgroundColor: '#4F6EF7',
  },

  // ── 로고 영역 ──
  logoArea: {
    alignItems: 'center',
    paddingTop: SPACING.md,
    paddingBottom: SPACING.base,
    gap: SPACING.xs,
  },
  logoBox: {
    position: 'relative',
    marginBottom: SPACING.sm,
  },
  logoGradient: {
    width: 84,
    height: 84,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoEmoji: {
    fontSize: 42,
  },
  glowRing1: {
    position: 'absolute',
    top: -8,
    left: -8,
    right: -8,
    bottom: -8,
    borderRadius: 36,
    borderWidth: 1.5,
    borderColor: 'rgba(79,110,247,0.4)',
  },
  glowRing2: {
    position: 'absolute',
    top: -18,
    left: -18,
    right: -18,
    bottom: -18,
    borderRadius: 46,
    borderWidth: 1,
    borderColor: 'rgba(79,110,247,0.15)',
  },
  appName: {
    fontSize: 42,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: 2,
    textShadowColor: 'rgba(79,110,247,0.6)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  appNameSub: {
    fontSize: FONTS.xs,
    fontWeight: FONTS.bold,
    color: COLORS.primary,
    textAlign: 'center',
    letterSpacing: 6,
    marginTop: -2,
  },
  divider: {
    width: width * 0.5,
    height: 1.5,
    marginVertical: SPACING.xs,
    overflow: 'hidden',
  },
  tagline: {
    fontSize: FONTS.md,
    fontWeight: FONTS.semibold,
    color: COLORS.textSecondary,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  taglineSub: {
    fontSize: FONTS.sm,
    color: COLORS.primary,
    textAlign: 'center',
    marginTop: 4,
    fontWeight: FONTS.medium,
  },
  featureBadges: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  featureBadge: {
    backgroundColor: 'rgba(79,110,247,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(79,110,247,0.3)',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
  },
  featureBadgeText: {
    fontSize: FONTS.xs,
    color: COLORS.primary,
    fontWeight: FONTS.semibold,
  },

  // ── 투자 주의 경고 ──
  disclaimerArea: {
    gap: SPACING.base,
  },
  disclaimerCard: {
    backgroundColor: '#0E1628',
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: 'rgba(245,200,66,0.25)',
    overflow: 'hidden',
  },
  disclaimerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.base,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(245,200,66,0.15)',
  },
  disclaimerHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  warningIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(245,200,66,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  warningIcon: { fontSize: 20 },
  disclaimerTitle: {
    fontSize: FONTS.md,
    fontWeight: FONTS.bold,
    color: COLORS.accentGold,
  },
  disclaimerTitleSub: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 1,
    letterSpacing: 0.5,
  },
  disclaimerBadge: {
    backgroundColor: 'rgba(245,200,66,0.2)',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: 'rgba(245,200,66,0.4)',
  },
  disclaimerBadgeText: {
    fontSize: FONTS.xs,
    color: COLORS.accentGold,
    fontWeight: FONTS.black,
    letterSpacing: 1,
  },
  disclaimerBody: {
    padding: SPACING.base,
    gap: SPACING.sm,
  },
  disclaimerText: {
    fontSize: FONTS.md,
    color: COLORS.textPrimary,
    fontWeight: FONTS.semibold,
    lineHeight: 24,
    textAlign: 'center',
  },
  disclaimerText2: {
    fontSize: FONTS.md,
    color: COLORS.textSecondary,
    lineHeight: 22,
    textAlign: 'center',
  },
  disclaimerHighlight: {
    color: COLORS.accentGold,
    fontWeight: FONTS.extrabold,
  },
  disclaimerList: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    gap: SPACING.xs,
    marginTop: SPACING.xs,
  },
  disclaimerListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  disclaimerDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.accentGold,
    opacity: 0.7,
  },
  disclaimerListText: {
    fontSize: FONTS.xs,
    color: COLORS.textMuted,
    lineHeight: 18,
    flex: 1,
  },

  // ── 동의 버튼 ──
  agreeBtn: {
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    shadowColor: '#4F6EF7',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
  agreeBtnGradient: {
    paddingVertical: SPACING.base + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  agreeBtnText: {
    fontSize: FONTS.md,
    fontWeight: FONTS.extrabold,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  agreeHint: {
    fontSize: FONTS.xs,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
});
