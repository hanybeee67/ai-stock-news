// 📁 app/(tabs)/_layout.tsx
// 탭 네비게이션 레이아웃 — v3.0: 픽 트래커 탭 추가

import { Tabs } from 'expo-router';
import React from 'react';
import { Text } from 'react-native';
import { COLORS } from '../../constants/theme';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textMuted,
        tabBarStyle: {
          backgroundColor: COLORS.bgCard,
          borderTopColor: COLORS.borderCard,
          borderTopWidth: 1,
          paddingBottom: 8,
          paddingTop: 8,
          height: 70,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          marginTop: 2,
        },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '오늘의 뉴스',
          tabBarIcon: ({ focused }) => (
            <Text style={{ fontSize: focused ? 24 : 22, opacity: focused ? 1 : 0.6 }}>📊</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="picks"
        options={{
          title: '픽 트래커',
          tabBarIcon: ({ focused }) => (
            <Text style={{ fontSize: focused ? 24 : 22, opacity: focused ? 1 : 0.6 }}>🎯</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: '히스토리',
          tabBarIcon: ({ focused }) => (
            <Text style={{ fontSize: focused ? 24 : 22, opacity: focused ? 1 : 0.6 }}>📅</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="saved"
        options={{
          title: '저장됨',
          tabBarIcon: ({ focused }) => (
            <Text style={{ fontSize: focused ? 24 : 22, opacity: focused ? 1 : 0.6 }}>🔖</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: '설정',
          tabBarIcon: ({ focused }) => (
            <Text style={{ fontSize: focused ? 24 : 22, opacity: focused ? 1 : 0.6 }}>⚙️</Text>
          ),
        }}
      />
    </Tabs>
  );
}
