import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { colors } from '../theme/colors';
import { chatSocket, sanitizeServerUrl, testServerConnection, isWhiteLabelBuild } from '../services/chatSocket';
import { storage } from '../services/storage';

interface ServerConfigModalProps {
  visible: boolean;
  onClose: () => void;
  onConnected?: (companyName: string, url: string) => void;
  canDismiss?: boolean;
}

export const ServerConfigModal: React.FC<ServerConfigModalProps> = ({
  visible,
  onClose,
  onConnected,
  canDismiss = true,
}) => {
  const [serverUrl, setServerUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [testedCompany, setTestedCompany] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentSavedUrl, setCurrentSavedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      storage.getServerUrl().then((saved) => {
        if (saved) {
          setServerUrl(saved);
          setCurrentSavedUrl(saved);
        } else {
          setServerUrl('');
          setCurrentSavedUrl(null);
        }
      });
      storage.getServerCompanyName().then((name) => {
        if (name) setTestedCompany(name);
      });
      setErrorMessage(null);
    }
  }, [visible]);

  const handlePasteClipboard = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (!text) {
        Alert.alert('Área de Transferência Vazia', 'Não há texto copiado na área de transferência.');
        return;
      }

      let candidate = text.trim();
      // Trata links do tipo solchat://connect?server=... ou http...
      if (candidate.includes('server=')) {
        const match = candidate.match(/server=([^&]+)/);
        if (match && match[1]) {
          candidate = decodeURIComponent(match[1]);
        }
      }

      setServerUrl(candidate);
      setErrorMessage(null);
    } catch {
      Alert.alert('Erro', 'Não foi possível ler a área de transferência.');
    }
  };

  const handleSetLocalDev = () => {
    setServerUrl('http://10.0.2.2:8080'); // Padrão Android Emulator
    setErrorMessage(null);
  };

  const handleTestAndConnect = async () => {
    const clean = serverUrl.trim();
    if (!clean) {
      setErrorMessage('Digite o endereço do servidor ou cole o link de pareamento.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const result = await testServerConnection(clean);
      setTestedCompany(result.companyName);

      // Salva a nova configuração
      await storage.saveServerUrl(result.url, result.companyName);

      if (onConnected) {
        onConnected(result.companyName, result.url);
      }

      Alert.alert(
        'Conexão Estabelecida! ✅',
        `Conectado com sucesso ao servidor de ${result.companyName}.`,
        [{ text: 'OK', onPress: onClose }]
      );
    } catch (err: any) {
      setErrorMessage(err.message || 'Falha ao conectar com o servidor.');
    } finally {
      setLoading(false);
    }
  };

  // Se o build for White-label embutido, não há necessidade de edição
  if (isWhiteLabelBuild()) {
    return null;
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={canDismiss ? onClose : undefined}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalOverlay}
      >
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <Ionicons name="server" size={24} color="#2563EB" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Conectar ao Provedor</Text>
              <Text style={styles.subtitle}>
                Informe a URL ou IP do servidor da sua empresa para conectar o aplicativo.
              </Text>
            </View>
            {canDismiss && (
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            )}
          </View>

          {/* Status atual */}
          {currentSavedUrl && (
            <View style={styles.currentCard}>
              <View style={styles.statusDot} />
              <View style={{ flex: 1 }}>
                <Text style={styles.currentLabel}>Servidor Conectado:</Text>
                <Text style={styles.currentValue} numberOfLines={1}>
                  {testedCompany ? `${testedCompany} (${currentSavedUrl})` : currentSavedUrl}
                </Text>
              </View>
            </View>
          )}

          {/* Input de Endereço */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Endereço do Servidor / Domínio</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="globe-outline" size={18} color="#94A3B8" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.input}
                value={serverUrl}
                onChangeText={(t) => {
                  setServerUrl(t);
                  setErrorMessage(null);
                }}
                placeholder="ex: chat.meuprovedor.com.br ou 45.166.31.237:8080"
                placeholderTextColor="#94A3B8"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
            </View>
            <Text style={styles.hint}>
              Dica: Você também pode copiar o link de pareamento no painel web e clicar no botão abaixo.
            </Text>
          </View>

          {/* Ações rápidas */}
          <View style={styles.quickActions}>
            <TouchableOpacity onPress={handlePasteClipboard} style={styles.quickButton}>
              <Ionicons name="clipboard-outline" size={16} color="#2563EB" />
              <Text style={styles.quickButtonText}>Colar Link Copiado</Text>
            </TouchableOpacity>

            {__DEV__ && (
              <TouchableOpacity onPress={handleSetLocalDev} style={styles.quickButton}>
                <Ionicons name="laptop-outline" size={16} color="#64748B" />
                <Text style={[styles.quickButtonText, { color: '#64748B' }]}>Emulador Local</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Feedback de Erro */}
          {errorMessage && (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={18} color="#DC2626" />
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          )}

          {/* Botão de Conexão */}
          <View style={styles.footer}>
            <TouchableOpacity
              onPress={handleTestAndConnect}
              disabled={loading}
              style={[styles.primaryButton, loading && { opacity: 0.7 }]}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
                  <Text style={styles.primaryButtonText}>Testar e Conectar</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    width: '100%',
    maxWidth: 420,
    padding: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 16,
  },
  closeButton: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  currentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 10,
    marginBottom: 14,
    gap: 10,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  currentLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  currentValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  formGroup: {
    marginBottom: 14,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  input: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  hint: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 5,
    lineHeight: 15,
  },
  quickActions: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  quickButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 6,
  },
  quickButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563EB',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 10,
    padding: 10,
    gap: 8,
    marginBottom: 14,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    color: '#B91C1C',
    fontWeight: '500',
  },
  footer: {
    marginTop: 4,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 13,
    gap: 8,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
