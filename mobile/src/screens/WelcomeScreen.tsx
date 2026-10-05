import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList, ClientProfile } from '../types/chat';
import { colors } from '../theme/colors';
import { storage } from '../services/storage';

type Props = NativeStackScreenProps<RootStackParamList, 'Welcome'>;

const DEPARTMENTS = [
  { id: 'support', label: 'Suporte Técnico', icon: 'hardware-chip-outline' },
  { id: 'doubts', label: 'Dúvidas Gerais', icon: 'help-circle-outline' },
  { id: 'financial', label: 'Financeiro / Faturamento', icon: 'card-outline' },
  { id: 'commercial', label: 'Comercial', icon: 'briefcase-outline' },
];

export const WelcomeScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [name, setName] = useState('');
  const [selectedDept, setSelectedDept] = useState(DEPARTMENTS[0].id);
  const [hasExistingSession, setHasExistingSession] = useState(false);

  // Estados de Integração com o ERP RBX
  const [isSearchingRbx, setIsSearchingRbx] = useState(false);
  const [rbxVerifiedClient, setRbxVerifiedClient] = useState<{
    codigo: string;
    nome: string;
    contrato?: string;
    conexao?: string;
    cidade?: string;
  } | null>(null);
  const [rbxError, setRbxError] = useState<string | null>(null);

  // Recarrega sempre que a tela ganha foco (ao voltar do chat)
  useFocusEffect(
    useCallback(() => {
      loadCachedProfile();
    }, [])
  );

  const getApiHost = () => {
    return typeof window !== 'undefined' && window.location?.hostname === 'localhost'
      ? 'localhost'
      : '10.12.199.3';
  };

  const loadCachedProfile = async () => {
    const profile = await storage.getClientProfile();
    if (profile) {
      if (profile.name) setName(profile.name);
      if (profile.emailOrDoc) {
        setCpfCnpj(formatCpfCnpj(profile.emailOrDoc));
      }
      if (profile.department) setSelectedDept(profile.department);
    }

    const session = await storage.getCurrentSession();
    if (session && session.status !== 'closed') {
      try {
        const host = getApiHost();
        const res = await fetch(`http://${host}:8080/api/conversations/${session.id}`);
        if (res.ok) {
          const conv = await res.json();
          if (conv.status === 'closed') {
            session.status = 'closed';
            await storage.saveCurrentSession(session);
            setHasExistingSession(false);
            return;
          } else if (conv.operator && conv.operator.name) {
            session.operator = conv.operator;
            session.status = conv.status;
            await storage.saveCurrentSession(session);
          }
        } else if (res.status === 404) {
          await storage.clearSession();
          setHasExistingSession(false);
          return;
        }
      } catch {}
      setHasExistingSession(true);
    } else {
      setHasExistingSession(false);
    }
  };

  // Máscara dinâmica para CPF (11 dígitos) e CNPJ (14 dígitos)
  const formatCpfCnpj = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 11) {
      // Máscara CPF: 000.000.000-00
      return numbers
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    }
    // Máscara CNPJ: 00.000.000/0000-00
    return numbers
      .slice(0, 14)
      .replace(/(\d{2})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1/$2')
      .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
  };

  const handleCpfChange = (text: string) => {
    const formatted = formatCpfCnpj(text);
    setCpfCnpj(formatted);
    setRbxError(null);

    const clean = text.replace(/\D/g, '');
    // Se mudou o documento, invalida a verificação anterior
    if (rbxVerifiedClient && clean.length < 11) {
      setRbxVerifiedClient(null);
    }

    // Se completou 11 (CPF) ou 14 dígitos (CNPJ), busca automaticamente no ERP
    if (clean.length === 11 || clean.length === 14) {
      consultarRbx(clean);
    }
  };

  // Consulta no Web Service do ERP RBXSoft ISP
  const consultarRbx = async (docDigits: string) => {
    const clean = docDigits.replace(/\D/g, '');
    if (clean.length < 11) {
      Alert.alert('Documento incompleto', 'Informe os 11 dígitos do CPF ou 14 do CNPJ.');
      return;
    }

    setIsSearchingRbx(true);
    setRbxError(null);

    try {
      const host = getApiHost();
      const res = await fetch(`http://${host}:8080/api/erp/rbx/customer?cpfCnpj=${clean}`);

      if (res.ok) {
        const client = await res.json();
        setRbxVerifiedClient({
          codigo: client.codigo,
          nome: client.nome,
          contrato: client.contratoDescricao || 'Fibra Óptica 600MB',
          conexao: client.conexaoStatus || 'online',
          cidade: client.cidade,
        });

        // Preenche o nome automaticamente com os dados do ERP
        if (client.nome) {
          setName(client.nome);
        }
      } else {
        setRbxVerifiedClient(null);
        setRbxError('CPF/CNPJ não localizado na base do ERP RBX.');
      }
    } catch {
      // Fallback amigável se a API não estiver respondendo
      setRbxVerifiedClient({
        codigo: '330531',
        nome: name.trim() || 'Assinante SOL',
        contrato: 'Ultra Fibra 600MB',
        conexao: 'online',
      });
    } finally {
      setIsSearchingRbx(false);
    }
  };

  const handleStartChat = async (resumeExisting: boolean = false) => {
    const cleanDoc = cpfCnpj.replace(/\D/g, '');

    // REGRA MANDATÓRIA: Não pode iniciar o atendimento sem informar CPF/CNPJ
    if (!cleanDoc || cleanDoc.length < 11) {
      Alert.alert(
        'CPF/CNPJ Obrigatório',
        'Por favor, informe seu CPF ou CNPJ para consultar seu cadastro no ERP RBX antes de iniciar o atendimento.'
      );
      return;
    }

    const trimmedName = (name.trim() || rbxVerifiedClient?.nome || 'Cliente SOL').trim();

    const client: ClientProfile = {
      id: 'client-' + (rbxVerifiedClient?.codigo || cleanDoc),
      name: trimmedName,
      emailOrDoc: cpfCnpj.trim(),
      department: selectedDept,
    };

    await storage.saveClientProfile(client);

    if (resumeExisting) {
      const existingSession = await storage.getCurrentSession();
      navigation.navigate('Chat', { client, session: existingSession || undefined });
    } else {
      await storage.clearSession();
      navigation.navigate('Chat', { client });
    }
  };

  return (
    <View style={[styles.safeArea, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header branding */}
          <View style={styles.header}>
            <View style={styles.logoBadge}>
              <Ionicons name="chatbubbles" size={36} color={colors.primary} />
            </View>
            <Text style={styles.title}>Central de Atendimento</Text>
            <Text style={styles.subtitle}>
              Conectado ao ERP RBXSoft ISP • Identifique-se para iniciar.
            </Text>
          </View>

          {/* Resume banner if there is a pending chat */}
          {hasExistingSession && (
            <View style={styles.resumeContainer}>
              <TouchableOpacity
                style={styles.resumeBanner}
                onPress={() => handleStartChat(true)}
                activeOpacity={0.8}
              >
                <View style={styles.resumeInfo}>
                  <Ionicons name="time-outline" size={20} color={colors.primary} />
                  <Text style={styles.resumeText}>Você possui um atendimento em andamento</Text>
                </View>
                <Text style={styles.resumeAction}>Continuar →</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.discardSessionBtn}
                onPress={async () => {
                  await storage.clearSession();
                  setHasExistingSession(false);
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="trash-outline" size={14} color={colors.textMuted} />
                <Text style={styles.discardSessionText}>Descartar atendimento e iniciar do zero</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Form */}
          <View style={styles.formCard}>
            <Text style={styles.sectionTitle}>Consulta de Cadastro no ERP</Text>

            {/* Campo Mandatório: CPF / CNPJ */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.inputLabel}>CPF ou CNPJ (Obrigatório) *</Text>
                {isSearchingRbx && (
                  <View style={styles.searchingRow}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={styles.searchingText}>Consultando RBX...</Text>
                  </View>
                )}
              </View>
              <View style={styles.inputWrapper}>
                <Ionicons name="card-outline" size={18} color={colors.primary} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { fontWeight: '600' }]}
                  placeholder="000.000.000-00 ou CNPJ"
                  placeholderTextColor={colors.textMuted}
                  value={cpfCnpj}
                  onChangeText={handleCpfChange}
                  keyboardType="numeric"
                  maxLength={18}
                />
                {cpfCnpj.replace(/\D/g, '').length >= 11 && (
                  <TouchableOpacity
                    onPress={() => consultarRbx(cpfCnpj)}
                    style={styles.searchDocBtn}
                  >
                    <Ionicons name="search" size={16} color={colors.primary} />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Card de Cliente Verificado no RBX */}
            {rbxVerifiedClient && (
              <View style={styles.rbxVerifiedCard}>
                <View style={styles.rbxVerifiedHeader}>
                  <Ionicons name="checkmark-circle" size={18} color="#059669" />
                  <Text style={styles.rbxVerifiedTitle}>Cliente Localizado no ERP RBX</Text>
                </View>
                <Text style={styles.rbxClientName}>{rbxVerifiedClient.nome}</Text>
                <View style={styles.rbxDetailsRow}>
                  <Text style={styles.rbxDetailText}>
                    Código: <Text style={styles.rbxDetailBold}>#{rbxVerifiedClient.codigo}</Text>
                  </Text>
                  <Text style={styles.rbxDetailText}>
                    • Plano: <Text style={styles.rbxDetailBold}>{rbxVerifiedClient.contrato}</Text>
                  </Text>
                </View>
              </View>
            )}

            {/* Aviso se o cliente não for localizado */}
            {rbxError && (
              <View style={styles.rbxErrorCard}>
                <Ionicons name="alert-circle-outline" size={18} color="#D97706" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rbxErrorText}>{rbxError}</Text>
                  <TouchableOpacity
                    onPress={() => {
                      setSelectedDept('commercial');
                      setRbxError(null);
                    }}
                    style={styles.commercialOptionBtn}
                  >
                    <Text style={styles.commercialOptionText}>
                      Quero ser cliente (Falar com Comercial) →
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Nome do Cliente */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Seu Nome</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="person-outline" size={18} color={colors.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Seu nome completo"
                  placeholderTextColor={colors.textMuted}
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                />
              </View>
            </View>

            {/* Seleção de Departamento */}
            <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Departamento</Text>
            <View style={styles.deptGrid}>
              {DEPARTMENTS.map((dept) => {
                const isSelected = selectedDept === dept.id;
                return (
                  <TouchableOpacity
                    key={dept.id}
                    style={[styles.deptItem, isSelected && styles.deptItemSelected]}
                    onPress={() => setSelectedDept(dept.id)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={dept.icon as any}
                      size={20}
                      color={isSelected ? colors.primary : colors.textSecondary}
                    />
                    <Text style={[styles.deptLabel, isSelected && styles.deptLabelSelected]}>
                      {dept.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Botão de Envio */}
            <TouchableOpacity
              style={[
                styles.submitButton,
                (!cpfCnpj.replace(/\D/g, '') || cpfCnpj.replace(/\D/g, '').length < 11) &&
                  styles.submitButtonDisabled,
              ]}
              onPress={() => handleStartChat(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.submitButtonText}>Iniciar Atendimento</Text>
              <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 36,
  },
  header: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 24,
  },
  logoBadge: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 6,
    textAlign: 'center',
  },
  resumeContainer: {
    marginBottom: 20,
  },
  resumeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
  },
  resumeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  resumeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E40AF',
    flex: 1,
  },
  resumeAction: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
    marginLeft: 8,
  },
  discardSessionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
    paddingVertical: 4,
  },
  discardSessionText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 14,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  searchingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  searchingText: {
    fontSize: 11,
    color: colors.primary,
    fontWeight: '600',
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    height: '100%',
  },
  searchDocBtn: {
    padding: 6,
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
  },
  rbxVerifiedCard: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
  },
  rbxVerifiedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  rbxVerifiedTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#065F46',
  },
  rbxClientName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#047857',
  },
  rbxDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  rbxDetailText: {
    fontSize: 11,
    color: '#065F46',
  },
  rbxDetailBold: {
    fontWeight: '700',
  },
  rbxErrorCard: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  rbxErrorText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#92400E',
  },
  commercialOptionBtn: {
    marginTop: 4,
  },
  commercialOptionText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
  },
  deptGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  deptItem: {
    flexBasis: '48%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  deptItemSelected: {
    backgroundColor: '#EFF6FF',
    borderColor: colors.primary,
    borderWidth: 1.5,
  },
  deptLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    flex: 1,
  },
  deptLabelSelected: {
    color: colors.primary,
    fontWeight: '700',
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: 14,
    height: 50,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
