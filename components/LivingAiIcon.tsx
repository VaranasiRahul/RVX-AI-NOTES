import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withTiming,
    Easing,
} from 'react-native-reanimated';
import { useTheme } from '@/context/ThemeContext';

const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

interface LivingAiIconProps {
    active?: boolean;
}

export default function LivingAiIcon({ active = false }: LivingAiIconProps) {
    const { colors } = useTheme();
    const rotate = useSharedValue(0);

    useEffect(() => {
        // Continuous rotation for the "alive" moving gradient effect
        rotate.value = withRepeat(
            withTiming(1, {
                duration: 6000,
                easing: Easing.linear,
            }),
            -1,
            false
        );
    }, []);

    const containerStyle = useAnimatedStyle(() => {
        return {
            shadowOpacity: withTiming(active ? 0.8 : 0), // No glow when not clicked
            shadowRadius: withTiming(active ? 15 : 0),
            transform: [{ scale: withTiming(active ? 1.05 : 1) }]
        };
    });

    const gradientStyle = useAnimatedStyle(() => {
        const rotationValue = rotate.value * 360;
        return {
            transform: [{ rotate: `${rotationValue}deg` }, { scale: 1.5 }],
            opacity: withTiming(active ? 1 : 0.65) // Subtle presence when inactive
        };
    });

    // Vibrant "Living AI" colors — as a fixed tuple to satisfy TypeScript
    const aiColors = ['#8B5CF6', '#D946EF', '#F43F5E', '#FB923C', '#8B5CF6'] as const;

    return (
        <Animated.View style={[
            styles.container,
            containerStyle,
            { shadowColor: '#D946EF' }
        ]}>
            <View style={styles.maskContainer}>
                <AnimatedLinearGradient
                    colors={aiColors}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[StyleSheet.absoluteFill, gradientStyle]}
                />
            </View>
            <Text style={styles.text}>AI</Text>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: 32, // Reduced size
        height: 32, // Reduced size
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        shadowOffset: { width: 0, height: 4 },
        elevation: 8,
    },
    maskContainer: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: 16,
        overflow: 'hidden',
    },
    text: {
        fontFamily: 'DMSans_700Bold',
        fontSize: 11, // Slightly smaller text for smaller circle
        letterSpacing: 0.5,
        zIndex: 1,
        color: '#FFFFFF', // Bright white always
    }
});
