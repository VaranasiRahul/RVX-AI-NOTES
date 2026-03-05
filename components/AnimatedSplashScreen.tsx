import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withDelay,
    Easing,
    runOnJS,
    interpolate,
    Extrapolate
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Props {
    onAnimationFinish: () => void;
    onReady?: () => void;
}

export default function AnimatedSplashScreen({ onAnimationFinish, onReady }: Props) {
    // Shared values for the two-stage reveal
    const stage1 = useSharedValue(0); // 0 to 1: Bar swipes from -110 to 0, revealing RVX
    const stage2 = useSharedValue(0); // 0 to 1: Notes revealed from center to the right
    const barOpacity = useSharedValue(0);
    const containerOpacity = useSharedValue(1);

    useEffect(() => {
        if (onReady) onReady();

        // Sequence (Stage 1):
        // 0. Bar appears
        barOpacity.value = withTiming(1, { duration: 400 });

        // 1. Bar swipes from left to center (Duration: 1000ms from v1)
        stage1.value = withDelay(400, withTiming(1, {
            duration: 1000,
            easing: Easing.bezier(0.33, 1, 0.68, 1)
        }));

        // 2. Bar stays at center, Notes reveal (Duration: 1000ms from v1)
        stage2.value = withDelay(1600, withTiming(1, {
            duration: 1200,
            easing: Easing.bezier(0.33, 1, 0.68, 1)
        }));

        // Final Fade Out
        containerOpacity.value = withDelay(3600, withTiming(0, {
            duration: 800
        }, (finished) => {
            if (finished) {
                runOnJS(onAnimationFinish)();
            }
        }));
    }, []);

    // Constants for pixel-perfect alignment
    const BAR_START_X = -130; // Increased range to ensure full text fits
    const BAR_CENTER_X = 0;

    // The Leader Bar
    const barStyle = useAnimatedStyle(() => {
        const tx = interpolate(stage1.value, [0, 1], [BAR_START_X, BAR_CENTER_X], Extrapolate.CLAMP);
        return {
            opacity: barOpacity.value,
            transform: [{ translateX: tx }],
        };
    });

    // RVX Reveal Mask
    const rvxMaskStyle = useAnimatedStyle(() => {
        const currentBarX = interpolate(stage1.value, [0, 1], [BAR_START_X, BAR_CENTER_X], Extrapolate.CLAMP);
        const width = currentBarX - BAR_START_X;
        const midPoint = (BAR_START_X + currentBarX) / 2;
        return {
            width: Math.max(0, width),
            opacity: interpolate(stage1.value, [0, 0.15], [0, 1], Extrapolate.CLAMP),
            transform: [{ translateX: midPoint }],
            position: 'absolute',
        };
    });

    // Notes Reveal Mask
    const notesMaskStyle = useAnimatedStyle(() => {
        const width = interpolate(stage2.value, [0, 1], [0, 160], Extrapolate.CLAMP);
        const midPoint = width / 2;
        return {
            width,
            opacity: interpolate(stage2.value, [0, 0.1], [0, 1], Extrapolate.CLAMP),
            transform: [{ translateX: midPoint }],
            position: 'absolute',
        };
    });

    const containerStyle = useAnimatedStyle(() => ({
        opacity: containerOpacity.value,
    }));

    return (
        <Animated.View style={[styles.container, containerStyle]}>
            <View style={styles.animationPivot}>

                {/* RVX Section */}
                <Animated.View style={[styles.mask, rvxMaskStyle]}>
                    <View style={[styles.textTrack, { alignItems: 'flex-end', paddingRight: 20 }]}>
                        <Text style={styles.logoText}>R  V  X</Text>
                    </View>
                </Animated.View>

                {/* The Bar */}
                <Animated.View style={[styles.bar, barStyle]} />

                {/* Notes Section */}
                <Animated.View style={[styles.mask, notesMaskStyle]}>
                    <View style={[styles.textTrack, { alignItems: 'flex-start', paddingLeft: 20 }]}>
                        <Text style={styles.logoText}>N O T E S</Text>
                    </View>
                </Animated.View>

            </View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#0F0E0D',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 999999,
    },
    animationPivot: {
        width: SCREEN_WIDTH,
        height: 100,
        justifyContent: 'center',
        alignItems: 'center',
        // Move to -3% (shifted 2% right from the previous -5%)
        transform: [{ translateX: -SCREEN_WIDTH * 0.03 }],
    },
    bar: {
        width: 2,
        height: 24,
        backgroundColor: '#FFFFFF',
        position: 'absolute',
    },
    mask: {
        height: 60,
        overflow: 'hidden',
        position: 'absolute',
        justifyContent: 'center',
    },
    textTrack: {
        width: 150, // Generous track to prevent any clipping
        height: '100%',
        justifyContent: 'center',
    },
    logoText: {
        fontFamily: 'DMSans_500Medium',
        fontSize: 20,
        letterSpacing: 2, // Clean spacing
        color: '#FFFFFF',
        textAlign: 'center',
        width: 150, // Keep it fixed
        includeFontPadding: false,
    },
});
