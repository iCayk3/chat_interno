import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';

interface RatingModalProps {
  visible: boolean;
  operatorName?: string;
  onSubmit: (rating: number, comment: string) => Promise<void>;
  onClose: () => void;
}

const RATING_LABELS: Record<number, { text: string; emoji: string; color: string }> = {
  1: { text: 'Muito Ruim', emoji: '😡', color: '#EF4444' },
  2: { text: 'Ruim', emoji: '🙁', color: '#F97316' },
  3: { text: 'Regular', emoji: '😐', color: '#F59E0B' },
  4: { text: 'Bom', emoji: '🙂', color: '#3B82F6' },
  5: { text: 'Excelente', emoji: '🤩', color: '#10B981' },
};

export const RatingModal: React.FC<RatingModalProps> = ({
  visible,
  operatorName,
  onSubmit,
  onClose,
}) => {
  const [selectedRating, setSelectedRating] = useState<number>(5);
  const [comment, setComment] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handleSend = async () => {
    if (selectedRating < 1 || isSubmitting) return;
    try {
      setIsSubmitting(true);
      await onSubmit(selectedRating, comment.trim());
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentLabel = RATING_LABELS[selectedRating] || RATING_LABELS[5];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <View style={styles.card}>
          {/* Header Icon */}
          <View style={styles.iconCircle}>
            <Ionicons name="star" size={32} color="#F59E0B" />
          </View>

          <Text style={styles.title}>Avalie seu Atendimento</Text>
          <Text style={styles.subtitle}>
            {operatorName
              ? `Como foi o atendimento prestado por ${operatorName}?`
              : 'Como foi sua experiência de atendimento hoje?'}
          </Text>

          {/* 5 Stars Rating */}
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((star) => {
              const isFilled = star <= selectedRating;
              return (
                <TouchableOpacity
                  key={star}
                  onPress={() => setSelectedRating(star)}
                  activeOpacity={0.7}
                  style={styles.starTouch}
                >
                  <Ionicons
                    name={isFilled ? 'star' : 'star-outline'}
                    size={36}
                    color={isFilled ? '#F59E0B' : '#CBD5E1'}
                  />
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Rating description badge */}
          <View style={[styles.badge, { backgroundColor: currentLabel.color + '15' }]}>
            <Text style={styles.badgeEmoji}>{currentLabel.emoji}</Text>
            <Text style={[styles.badgeText, { color: currentLabel.color }]}>
              {selectedRating} - {currentLabel.text}
            </Text>
          </View>

          {/* Optional comment field */}
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.textInput}
              placeholder="Deixe um comentário ou elogio (opcional)..."
              placeholderTextColor={colors.textMuted}
              value={comment}
              onChangeText={setComment}
              multiline
              maxLength={250}
              numberOfLines={3}
            />
          </View>

          {/* Action Buttons */}
          <TouchableOpacity
            style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
            onPress={handleSend}
            disabled={isSubmitting}
            activeOpacity={0.8}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Text style={styles.submitButtonText}>Enviar Avaliação</Text>
                <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" style={{ marginLeft: 6 }} />
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.skipButton}
            onPress={onClose}
            disabled={isSubmitting}
            activeOpacity={0.7}
          >
            <Text style={styles.skipButtonText}>Agora não / Pular</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 8,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  starTouch: {
    padding: 4,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 18,
    gap: 6,
  },
  badgeEmoji: {
    fontSize: 16,
  },
  badgeText: {
    fontSize: 14,
    fontWeight: '700',
  },
  inputContainer: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 20,
  },
  textInput: {
    fontSize: 14,
    color: colors.text,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  submitButton: {
    width: '100%',
    height: 48,
    backgroundColor: colors.primary,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  skipButton: {
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  skipButtonText: {
    fontSize: 14,
    color: colors.textMuted,
    fontWeight: '500',
  },
});
