import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs } from "expo-router";
import { NativeTabs, Icon, Label } from "expo-router/unstable-native-tabs";
import { BlurView } from "expo-blur";
import { Platform, StyleSheet, View, Dimensions , Pressable } from "react-native";
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/context/ThemeContext";

function NativeTabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "sparkles", selected: "sparkles" }} />
        <Label>Today</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="summaries">
        <Icon sf={{ default: "list.bullet", selected: "list.bullet" }} />
        <Label>Summaries</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="folders">
        <Icon sf={{ default: "folder", selected: "folder.fill" }} />
        <Label>Folders</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="streak">
        <Icon sf={{ default: "flame", selected: "flame.fill" }} />
        <Label>Streak</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <Icon sf={{ default: "gearshape", selected: "gearshape.fill" }} />
        <Label>Settings</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function LiquidTabButton({ route, isFocused, onPress, onLongPress, color }: any) {
  const scale = useSharedValue(isFocused ? 1.08 : 1);
  const iconOpacity = useSharedValue(isFocused ? 1 : 0.5);

  React.useEffect(() => {
    scale.value = withSpring(isFocused ? 1.08 : 1, { damping: 14, stiffness: 200 });
    iconOpacity.value = withTiming(isFocused ? 1 : 0.5, { duration: 220 });
  }, [isFocused]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: iconOpacity.value,
  }));

  let iconName = 'ellipse' as any;
  if (route.name === 'index') iconName = 'grid';
  else if (route.name === 'folders') iconName = 'folder';
  else if (route.name === 'streak') iconName = 'flame';
  else if (route.name === 'summaries') iconName = 'sparkles';
  else if (route.name === 'settings') iconName = 'settings-outline';

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center', height: '100%' }}
    >
      <Animated.View style={animStyle}>
        <Ionicons name={iconName} size={20} color={isFocused ? "#FFFFFF" : color} />
      </Animated.View>
    </Pressable>
  );
}

function CustomLiquidTabBar({ state, descriptors, navigation, insets, Colors }: any) {
  const isIOS = Platform.OS === "ios";

  return (
    <View style={{
      position: 'absolute',
      bottom: Platform.OS === 'web' ? 20 : Math.max(insets.bottom, 16),
      left: 24,
      right: 24,
      height: 56, // Changed from 48 to 56 to match top navbar height
      borderRadius: 24,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.3,
      shadowRadius: 20,
      elevation: 0, // No shadow underneath dropping opacity
    }}>
      <BlurView
        intensity={isIOS ? 39 : 25}
        tint="dark"
        experimentalBlurMethod="dimezisBlurView"
        style={{
          ...StyleSheet.absoluteFillObject,
          borderRadius: 24,
          overflow: "hidden",
          backgroundColor: isIOS ? "rgba(255, 255, 255, 0.05)" : "rgba(10, 20, 30, 0.25)",
          borderTopWidth: 1.5,
          borderTopColor: "rgba(255, 255, 255, 0.2)",
          borderLeftWidth: 1,
          borderLeftColor: "rgba(255, 255, 255, 0.1)",
          borderRightWidth: 1,
          borderRightColor: "rgba(255, 255, 255, 0.05)",
          borderBottomWidth: 1,
          borderBottomColor: "rgba(0, 0, 0, 0.4)",
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 8,
        }}
      >
        {state.routes.map((route: any, index: number) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          const onLongPress = () => {
            navigation.emit({ type: 'tabLongPress', target: route.key });
          };

          return (
            <LiquidTabButton
              key={route.key}
              route={route}
              isFocused={isFocused}
              onPress={onPress}
              onLongPress={onLongPress}
              color={isFocused ? Colors.accent : Colors.textMuted}
            />
          );
        })}
      </BlurView>
    </View>
  );
}

function ClassicTabLayout() {
  const insets = useSafeAreaInsets();
  const { colors: Colors } = useTheme();

  return (
    <Tabs
      tabBar={(props) => <CustomLiquidTabBar {...props} insets={insets} Colors={Colors} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="summaries" />
      <Tabs.Screen name="folders" />
      <Tabs.Screen name="streak" />
      <Tabs.Screen name="settings" />
    </Tabs>
  );
}


const styles = StyleSheet.create({
  iconContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
});

export default function TabLayout() {
  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}
