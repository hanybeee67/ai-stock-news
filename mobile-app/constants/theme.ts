// 📁 constants/theme.ts
// 앱 전체 디자인 시스템 - 컬러 팔레트, 폰트, 간격 정의

export const COLORS = {
  // Primary Brand Colors
  primary: '#4F6EF7',
  primaryLight: '#7B93FF',
  primaryDark: '#3451D1',

  // Background System (다크 모드)
  bgDeep: '#060914',
  bgBase: '#0A0E1A',
  bgCard: '#111827',
  bgCardHover: '#1A2438',
  bgSurface: '#1E2D45',

  // Accent Colors
  accentGold: '#F5C842',
  accentGoldDim: 'rgba(245, 200, 66, 0.15)',
  accentGreen: '#22D3A0',
  accentGreenDim: 'rgba(34, 211, 160, 0.15)',
  accentRed: '#FF5C7A',
  accentRedDim: 'rgba(255, 92, 122, 0.15)',
  accentOrange: '#FF8C42',
  accentOrangeDim: 'rgba(255, 140, 66, 0.15)',
  accentPurple: '#A855F7',
  accentPurpleDim: 'rgba(168, 85, 247, 0.15)',

  // Text Colors
  textPrimary: '#F1F5FF',
  textSecondary: '#94A3C4',
  textMuted: '#4A5882',
  textDim: '#2E3A55',

  // Border & Separator
  border: 'rgba(79, 110, 247, 0.2)',
  borderLight: 'rgba(255, 255, 255, 0.06)',
  borderCard: 'rgba(255, 255, 255, 0.08)',

  // Status Colors
  danger: '#FF5C7A',
  dangerBg: 'rgba(255, 92, 122, 0.1)',
  warning: '#F5C842',
  warningBg: 'rgba(245, 200, 66, 0.1)',
  success: '#22D3A0',
  successBg: 'rgba(34, 211, 160, 0.1)',

  // Importance Level Colors
  critical: '#FF5C7A',
  high: '#FF8C42',
  medium: '#F5C842',
  low: '#22D3A0',

  // Glass Effect
  glass: 'rgba(255, 255, 255, 0.05)',
  glassBorder: 'rgba(255, 255, 255, 0.1)',

  white: '#FFFFFF',
  transparent: 'transparent',
};

export const FONTS = {
  // Font sizes
  xs: 10,
  sm: 12,
  md: 14,
  base: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  xxxl: 28,
  display: 34,

  // Font weights (as strings for React Native)
  light: '300' as const,
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
  black: '900' as const,
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
  section: 48,
};

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  full: 9999,
};

export const SHADOWS = {
  card: {
    shadowColor: '#4F6EF7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  strong: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 16,
  },
  glow: {
    shadowColor: '#4F6EF7',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 10,
  },
};

// 카테고리별 컬러 & 이모지 매핑
export const CATEGORY_CONFIG: Record<string, { color: string; bg: string; emoji: string }> = {
  '반도체': { color: COLORS.primary, bg: 'rgba(79, 110, 247, 0.15)', emoji: '💻' },
  '바이오': { color: COLORS.accentGreen, bg: COLORS.accentGreenDim, emoji: '🧬' },
  '2차전지': { color: COLORS.accentGold, bg: COLORS.accentGoldDim, emoji: '⚡' },
  '매크로': { color: COLORS.accentPurple, bg: COLORS.accentPurpleDim, emoji: '🌐' },
  '에너지': { color: COLORS.accentOrange, bg: COLORS.accentOrangeDim, emoji: '🔥' },
  '방위산업': { color: COLORS.accentRed, bg: COLORS.accentRedDim, emoji: '🛡️' },
  '원자재': { color: '#C084FC', bg: 'rgba(192, 132, 252, 0.15)', emoji: '⛏️' },
  '공급망': { color: '#38BDF8', bg: 'rgba(56, 189, 248, 0.15)', emoji: '🔗' },
  '부동산': { color: '#FB923C', bg: 'rgba(251, 146, 60, 0.15)', emoji: '🏗️' },
  '기술': { color: '#A78BFA', bg: 'rgba(167, 139, 250, 0.15)', emoji: '🚀' },
  '식품/농업': { color: '#86EFAC', bg: 'rgba(134, 239, 172, 0.15)', emoji: '🌾' },
  '금융': { color: '#67E8F9', bg: 'rgba(103, 232, 249, 0.15)', emoji: '🏦' },
};
