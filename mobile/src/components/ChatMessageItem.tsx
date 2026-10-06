import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Message } from '../types/chat';
import { colors } from '../theme/colors';
import { getApiHttpBaseUrl } from '../services/chatSocket';
import { downloadAndSavePdf } from '../services/fileDownload';

interface ChatMessageItemProps {
  message: Message;
}

export const ChatMessageItem: React.FC<ChatMessageItemProps> = ({ message }) => {
  const [isDownloading, setIsDownloading] = useState(false);
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

  const handleDownloadPdf = async (relativeOrFullUrl: string) => {
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      const fullUrl = relativeOrFullUrl.startsWith('http')
        ? relativeOrFullUrl
        : `${getApiHttpBaseUrl()}${relativeOrFullUrl}`;

      const urlParts = relativeOrFullUrl.split('/');
      const rawName = urlParts[urlParts.length - 1]?.split('?')[0];
      const filename = rawName && rawName.endsWith('.pdf') ? rawName : `boleto_${Date.now()}.pdf`;

      await downloadAndSavePdf(fullUrl, filename);
    } finally {
      setIsDownloading(false);
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

  // Verificar se a mensagem possui anexo/link de boleto PDF
  const boletoMatch = message.content.match(/(\/api\/files\/boletos\/[^\s\)]+)/);
  const textPart = boletoMatch
    ? message.content.replace(/\[Baixar Boleto PDF\]\([^)]+\)/g, '').trim()
    : message.content;

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

        {textPart.length > 0 && (
          <Text style={[styles.messageText, isClient ? styles.clientText : styles.operatorText]}>
            {textPart}
          </Text>
        )}

        {boletoMatch && (
          <View style={[styles.pdfCard, isClient ? styles.pdfCardClient : styles.pdfCardOperator]}>
            <View style={styles.pdfHeader}>
              <View style={[styles.pdfIconContainer, isClient ? styles.pdfIconContainerClient : styles.pdfIconContainerOperator]}>
                <Ionicons name="document-text" size={20} color={isClient ? '#FFFFFF' : '#DC2626'} />
              </View>
              <View style={styles.pdfInfo}>
                <Text style={[styles.pdfTitle, isClient ? styles.pdfTextLight : styles.pdfTextDark]} numberOfLines={1}>
                  Boleto Bancário (2ª Via Oficial)
                </Text>
                <View style={styles.pdfBadgeRow}>
                  <Ionicons
                    name="time-outline"
                    size={11}
                    color={isClient ? 'rgba(255,255,255,0.85)' : colors.textMuted}
                  />
                  <Text style={[styles.pdfSubtitle, isClient ? styles.pdfTextMutedLight : styles.pdfTextMutedDark]}>
                    Expira do servidor em 1h
                  </Text>
                </View>
              </View>
            </View>

            <TouchableOpacity
              style={[
                styles.pdfButton,
                isClient ? styles.pdfButtonClient : styles.pdfButtonOperator,
                isDownloading && { opacity: 0.75 },
              ]}
              activeOpacity={0.8}
              onPress={() => handleDownloadPdf(boletoMatch[1])}
              disabled={isDownloading}
            >
              {isDownloading ? (
                <ActivityIndicator
                  size="small"
                  color={isClient ? colors.primary : '#FFFFFF'}
                />
              ) : (
                <Ionicons
                  name="cloud-download-outline"
                  size={16}
                  color={isClient ? colors.primary : '#FFFFFF'}
                />
              )}
              <Text style={[styles.pdfButtonText, isClient ? styles.pdfButtonTextClient : styles.pdfButtonTextOperator]}>
                {isDownloading ? 'Baixando Boleto...' : 'Baixar Boleto (PDF)'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

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
  pdfCard: {
    marginTop: 8,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
  },
  pdfCardClient: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  pdfCardOperator: {
    backgroundColor: '#FFFFFF',
    borderColor: colors.border,
  },
  pdfHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pdfIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pdfIconContainerClient: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  pdfIconContainerOperator: {
    backgroundColor: '#FEE2E2',
  },
  pdfInfo: {
    flex: 1,
  },
  pdfTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  pdfTextLight: {
    color: '#FFFFFF',
  },
  pdfTextDark: {
    color: colors.text,
  },
  pdfBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  pdfSubtitle: {
    fontSize: 10,
    fontWeight: '500',
  },
  pdfTextMutedLight: {
    color: 'rgba(255, 255, 255, 0.85)',
  },
  pdfTextMutedDark: {
    color: colors.textMuted,
  },
  pdfButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  pdfButtonClient: {
    backgroundColor: '#FFFFFF',
  },
  pdfButtonOperator: {
    backgroundColor: colors.primary,
  },
  pdfButtonText: {
    fontSize: 12,
    fontWeight: '700',
  },
  pdfButtonTextClient: {
    color: colors.primary,
  },
  pdfButtonTextOperator: {
    color: '#FFFFFF',
  },
});
