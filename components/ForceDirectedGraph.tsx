import React, { useMemo, useState } from "react";
import { View, StyleSheet, Dimensions, Text } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withDecay,
    runOnJS,
} from "react-native-reanimated";
import Svg, { Line, Circle as SvgCircle } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const MAP_SIZE = 1500; // Safer canvas size to prevent texture limits

export interface GraphNode {
    id: string;
    label: string;
    type: "folder" | "topic";
    color: string;
    radius: number;
    x: number;
    y: number;
    parentId?: string; // If topic, link to folder
    topicIndex?: number;
    noteId?: string;
}

export interface GraphEdge {
    id: string;
    source: string; // Folder ID
    target: string; // Topic ID
}

interface ForceDirectedGraphProps {
    nodes: GraphNode[];
    edges: GraphEdge[];
    onNodePress?: (node: GraphNode) => void;
    Colors: any;
}

export default function ForceDirectedGraph({
    nodes,
    edges,
    onNodePress,
    Colors,
}: ForceDirectedGraphProps) {
    // Center camera initially
    const translateX = useSharedValue(-(MAP_SIZE - SCREEN_WIDTH) / 2);
    const translateY = useSharedValue(-(MAP_SIZE - SCREEN_HEIGHT) / 2);
    const scale = useSharedValue(1);

    const savedTranslateX = useSharedValue(-(MAP_SIZE - SCREEN_WIDTH) / 2);
    const savedTranslateY = useSharedValue(-(MAP_SIZE - SCREEN_HEIGHT) / 2);
    const savedScale = useSharedValue(1);

    const [activeNode, setActiveNode] = useState<string | null>(null);

    const panGesture = Gesture.Pan()
        .onStart(() => {
            savedTranslateX.value = translateX.value;
            savedTranslateY.value = translateY.value;
        })
        .onUpdate((e) => {
            translateX.value = savedTranslateX.value + e.translationX;
            translateY.value = savedTranslateY.value + e.translationY;
        })
        .onEnd((e) => {
            translateX.value = withDecay({ velocity: e.velocityX });
            translateY.value = withDecay({ velocity: e.velocityY });
        });

    const pinchGesture = Gesture.Pinch()
        .onStart(() => {
            savedScale.value = scale.value;
        })
        .onUpdate((e) => {
            scale.value = savedScale.value * e.scale;
        })
        .onEnd(() => {
            // Limit zoom bounds
            if (scale.value < 0.5) scale.value = withSpring(0.5);
            if (scale.value > 2.5) scale.value = withSpring(2.5);
        });

    const composedGesture = Gesture.Simultaneous(panGesture, pinchGesture);

    const animatedCanvasStyle = useAnimatedStyle(() => ({
        transform: [
            { translateX: translateX.value },
            { translateY: translateY.value },
            { scale: scale.value },
        ],
    }));

    const handleNodePress = (node: GraphNode) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setActiveNode(node.id);
        if (onNodePress) onNodePress(node);
    };

    return (
        <View style={styles.container}>
            <GestureDetector gesture={composedGesture}>
                <Animated.View
                    style={[
                        styles.canvas,
                        { width: MAP_SIZE, height: MAP_SIZE },
                        animatedCanvasStyle,
                    ]}
                >
                    <Svg height={MAP_SIZE} width={MAP_SIZE} style={StyleSheet.absoluteFill}>
                        {edges.map((edge) => {
                            const sourceNode = nodes.find((n) => n.id === edge.source);
                            const targetNode = nodes.find((n) => n.id === edge.target);
                            if (!sourceNode || !targetNode) return null;

                            return (
                                <Line
                                    key={edge.id}
                                    x1={sourceNode.x}
                                    y1={sourceNode.y}
                                    x2={targetNode.x}
                                    y2={targetNode.y}
                                    stroke={Colors.border} // subtle safe line
                                    strokeWidth="2"
                                />
                            );
                        })}
                    </Svg>

                    {nodes.map((node) => {
                        const isFolder = node.type === "folder";
                        const isActive = activeNode === node.id;
                        return (
                            <Animated.View
                                key={node.id}
                                style={[
                                    styles.nodeWrapper,
                                    {
                                        left: node.x - node.radius,
                                        top: node.y - node.radius,
                                        width: node.radius * 2,
                                        height: node.radius * 2,
                                    },
                                ]}
                            >
                                <GestureDetector
                                    gesture={Gesture.Tap().onEnd(() => {
                                        runOnJS(handleNodePress)(node);
                                    })}
                                >
                                    <Animated.View
                                        style={[
                                            styles.nodeCircle,
                                            {
                                                backgroundColor: Colors.card, // Fallback safe color
                                                borderColor: node.color,
                                                borderWidth: isFolder ? 2 : 1,
                                                borderRadius: node.radius,
                                                shadowColor: node.color,
                                                shadowOpacity: isFolder ? 0.8 : 0,
                                                shadowRadius: isFolder ? 12 : 0,
                                                transform: [{ scale: isActive ? 1.1 : 1 }],
                                            },
                                        ]}
                                    >
                                        {isFolder && (
                                            <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: node.color, opacity: 0.2, borderRadius: node.radius }} />
                                        )}
                                        {isFolder && (
                                            <Ionicons name="folder" size={18} color={node.color} />
                                        )}
                                    </Animated.View>
                                </GestureDetector>
                                <Text
                                    style={[
                                        styles.nodeLabel,
                                        {
                                            color: isFolder ? Colors.text : Colors.textSecondary,
                                            top: node.radius * 2 + 4,
                                            fontFamily: isFolder ? "PlayfairDisplay_600SemiBold" : "DMSans_400Regular",
                                            fontSize: isFolder ? 14 : 10,
                                        },
                                    ]}
                                    numberOfLines={2}
                                >
                                    {node.label}
                                </Text>
                            </Animated.View>
                        );
                    })}
                </Animated.View>
            </GestureDetector>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        overflow: "hidden",
    },
    canvas: {
        ...StyleSheet.absoluteFillObject,
    },
    nodeWrapper: {
        position: "absolute",
        alignItems: "center",
        justifyContent: "center",
    },
    nodeCircle: {
        width: "100%",
        height: "100%",
        alignItems: "center",
        justifyContent: "center",
    },
    nodeLabel: {
        position: "absolute",
        width: 100,
        textAlign: "center",
        textShadowColor: "rgba(0,0,0,0.8)",
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
    },
});
