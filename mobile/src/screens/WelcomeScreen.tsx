import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  const [name, setName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [selectedDept, setSelectedDept] = useState(DEPARTMENTS[0].id);
  const [hasExistingSession, setHasExistingSession] = useState(false);

  useEffect(() => {
    loadCachedProfile();
  }, []);

  const loadCachedProfile = async () => {
    const profile = await storage.getClientProfile();
    if (profile) {
      setName(profile.name);
      if (profile.emailOrDoc) setIdentifier(profile.emailOrDoc);
      if (profile.department) setSelectedDept(profile.department);
    }

    const session = await storage.getCurrentSession();
    if (session && session.status !== 'closed') {
      setHasExistingSession(true);
    }
  };

  const handleStartChat = async (resumeExisting: boolean = false) => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('Campo obrigatório', 'Por favor, informe seu nome para iniciar o atendimento.');
      return;
    }

    const client: ClientProfile = {
      id: 'client-' + Math.random().toString(36).substring(2, 9),
      name: trimmedName,
      emailOrDoc: identifier.trim(),
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
            <Text style={styles.title}>Canal de Atendimento</Text>
            <Text style={styles.subtitle}>
              Converse em tempo real com nossa equipe de operadores.
            </Text>
          </View>

          {/* Resume banner if there is a pending chat */}
          {hasExistingSession && (
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
          )}

          {/* Form */}
          <View style={styles.formCard}>
            <Text style={styles.sectionTitle}>Identificação</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Seu Nome *</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="person-outline" size={18} color={colors.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Ex: Carlos Silva"
                  placeholderTextColor={colors.textMuted}
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>CPF ou E-mail (Opcional)</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="mail-outline" size={18} color={colors.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Para agilizar sua consulta"
                  placeholderTextColor={colors.textMuted}
                  value={identifier}
                  onChangeText={setIdentifier}
                  autoCapitalize="none"
                />
              </View>
            </View>

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

            <TouchableOpacity
              style={styles.submitButton}
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
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: 16,
    lineHeight: 20,
  },
  resumeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primaryLight,
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#BFDBFE',
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
    color: colors.primaryDark,
  },
  resumeAction: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 46,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
  },
  deptGrid: {
    gap: 8,
    marginBottom: 24,
  },
  deptItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    gap: 10,
  },
  deptItemSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  deptLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  deptLabelSelected: {
    color: colors.primaryDark,
    fontWeight: '600',
  },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
