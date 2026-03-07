import React from 'react';
import { FlexWidget, TextWidget, ListWidget } from 'react-native-android-widget';
import type { ColorProp } from 'react-native-android-widget';

export interface WidgetData {
    title: string;
    folderName: string;
    folderColor: string;
    folderId: string;
    body: string;
    noteId: string;
    topicIndex: number;
}

// Very simple markdown parser for Android Widget TextWidgets
// Widgets don't support rich text formatting easily, so we split by newlines
// and apply basic styles (bolding headings, handling lists)
function renderMarkdownToWidgets(markdown: string) {
    const lines = markdown.split('\n');
    const widgets: React.ReactNode[] = [];

    let keyCounter = 0;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (!line) continue;

        let fontSize = 14;
        let isBold = false;
        let color = '#E2E8F0'; // light gray for regular text
        let indent = 0;

        // Headings
        if (line.startsWith('#')) {
            const level = line.match(/^#+/)?.[0].length || 1;
            line = line.replace(/^#+\s*/, '');
            isBold = true;
            color = '#FFFFFF';
            fontSize = level === 1 ? 18 : level === 2 ? 16 : 15;
        }
        // Lists
        else if (line.startsWith('- ') || line.startsWith('* ')) {
            line = '• ' + line.substring(2);
            indent = 8;
        } else if (line.match(/^\d+\.\s/)) {
            // Keep numbered lists but just add indent
            indent = 8;
        }
        // Blockquotes
        else if (line.startsWith('> ')) {
            line = line.substring(2);
            color = '#94A3B8'; // somewhat muted
            indent = 12;
            isBold = false;
        }

        // Bold text handling - naive approach (remove ** and make bold if whole line is mostly bold)
        // Widgets don't allow inline bolding easily in one string, so we just remove the ** chars
        // and if the line ends up looking like a heading, we bold it.
        if (line.includes('**')) {
            line = line.replace(/\*\*/g, '');
        }

        widgets.push(
            <FlexWidget
                key={`line-${keyCounter++}`}
                style={{
                    paddingLeft: indent,
                    paddingBottom: 4,
                    paddingTop: isBold ? 6 : 0, // Add space above headings
                }}
            >
                <TextWidget
                    text={line}
                    style={{
                        fontSize,
                        color: color as ColorProp,
                        fontFamily: isBold ? 'DMSans_600SemiBold' : 'DMSans_400Regular',
                    }}
                />
            </FlexWidget>
        );
    }

    return widgets;
}

export function MarkedBlockWidget({ data }: { data: WidgetData | null }) {
    if (!data) {
        return (
            <FlexWidget
                style={{
                    height: 'match_parent',
                    width: 'match_parent',
                    backgroundColor: '#0F0E0D' as ColorProp,
                    borderRadius: 16,
                    justifyContent: 'center',
                    alignItems: 'center',
                    padding: 16,
                }}
            >
                <TextWidget
                    text="No marked blocks found."
                    style={{ fontSize: 16, color: '#A0AEC0' as ColorProp, fontFamily: 'DMSans_400Regular' }}
                />
                <TextWidget
                    text="Bookmark some topics in the app!"
                    style={{ fontSize: 14, color: '#718096' as ColorProp, fontFamily: 'DMSans_400Regular', marginTop: 8 }}
                />
            </FlexWidget>
        );
    }

    return (
        <FlexWidget
            style={{
                height: 'match_parent',
                width: 'match_parent',
                backgroundColor: '#0F0E0D' as ColorProp,
                borderRadius: 16,
                padding: 16,
                flexDirection: 'column',
            }}
            clickAction="OPEN_URI"
            clickActionData={{ uri: `reviseit://topic/${data.folderId || 'f'}/${data.noteId}/${data.topicIndex}` }}
        >
            {/* Header */}
            <FlexWidget
                style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    marginBottom: 12,
                }}
            >
                <FlexWidget
                    style={{
                        backgroundColor: ((data.folderColor || '#D4A96A') + '33') as ColorProp, // 20% opacity approx
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        borderRadius: 12,
                        flexDirection: 'row',
                        alignItems: 'center',
                    }}
                >
                    <FlexWidget style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: (data.folderColor || '#D4A96A') as ColorProp, marginRight: 6 }} />
                    <TextWidget
                        text={data.folderName || 'Topic'}
                        style={{ fontSize: 12, color: (data.folderColor || '#D4A96A') as ColorProp, fontFamily: 'DMSans_600SemiBold' }}
                    />
                </FlexWidget>
            </FlexWidget>

            {/* Scrollable Content */}
            <ListWidget
                style={{
                    width: 'match_parent',
                    height: 'match_parent', // takes remaining space
                }}
            >
                <FlexWidget style={{ flexDirection: 'column' }}>
                    <TextWidget
                        text={data.title}
                        style={{
                            fontSize: 18,
                            color: '#FFFFFF' as ColorProp,
                            fontFamily: 'DMSans_600SemiBold',
                            marginBottom: 8,
                        }}
                    />
                    {renderMarkdownToWidgets(data.body)}
                </FlexWidget>
            </ListWidget>
        </FlexWidget>
    );
}
