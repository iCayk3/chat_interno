import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Message } from '../types/chat';
import { colors } from '../theme/colors';

interface ChatMessageItemProps {
  message: Message;
}

export const ChatMessageItem: React.FC<ChatMessageItemProps> = ({ message }) => {
  const isClient = message.senderType === 'client';
  const isSystem = message.senderType === 'system';

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  if (isSystem) {
    return (
      <View style={styles.systemContainer}>
        <View style={styles.systemBubble}>
          <Text style={styles.systemText}>{message.content}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, isClient ? styles.clientAlign : styles.operatorAlign]}>
      <View
        style={[
          styles.bubble,
          isClient ? styles.clientBubble : styles.operatorBubble,
        ]}
      >
        {!isClient && (
          <Text style={styles.senderName}>{message.senderName || 'Atendente'}</Text>
        )}
        <Text style={[styles.messageText, isClient ? styles.clientText : styles.operatorText]}>
          {message.content}
        </Text>
        <View style={styles.metaRow}>
          <Text style={[styles.timeText, isClient ? styles.clientTimeText : styles.operatorTimeText]}>
            {formatTime(message.timestamp)}
          </Text>
          {isClient && (
            <Text style={styles.statusCheck}>
              {message.status === 'read' ? '✓✓' : message.status === 'delivered' ? '✓✓' : '✓'}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
    paddingHorizontal: 16,
    width: '100%',
  },
  clientAlign: {
    alignItems: 'flex-end',
  },
  operatorAlign: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '82%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  clientBubble: {
    backgroundColor: colors.clientBubble,
    borderBottomRightRadius: 4,
  },
  operatorBubble: {
    backgroundColor: colors.operatorBubble,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  senderName: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
    marginBottom: 3,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 21,
  },
  clientText: {
    color: colors.clientText,
  },
  operatorText: {
    color: colors.operatorText,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
    gap: 4,
  },
  timeText: {
    fontSize: 11,
  },
  clientTimeText: {
    color: 'rgba(255, 255, 255, 0.75)',
  },
  operatorTimeText: {
    color: colors.textMuted,
  },
  statusCheck: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: 'bold',
  },
  systemContainer: {
    alignItems: 'center',
    marginVertical: 8,
    paddingHorizontal: 20,
  },
  systemBubble: {
    backgroundColor: colors.systemBubble,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  systemText: {
    fontSize: 12,
    color: colors.systemText,
    textAlign: 'center',
  },
});
