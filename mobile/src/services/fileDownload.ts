import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as IntentLauncher from 'expo-intent-launcher';
import { Alert, Platform } from 'react-native';

/**
 * downloadAndSavePdf baixa o arquivo PDF para o aparelho e abre diretamente
 * no leitor de PDF do dispositivo (Android / iOS).
 */
export async function downloadAndSavePdf(
  fileUrl: string,
  suggestedFilename?: string
): Promise<boolean> {
  try {
    const rawName = suggestedFilename || `boleto_${Date.now()}.pdf`;
    const cleanFilename = rawName.endsWith('.pdf') ? rawName : `${rawName}.pdf`;
    const localUri = `${FileSystem.documentDirectory}${cleanFilename}`;

    console.log('[DOWNLOAD] Baixando boleto PDF:', fileUrl, 'para', localUri);
    const downloadRes = await FileSystem.downloadAsync(fileUrl, localUri);

    if (downloadRes.status !== 200) {
      if (downloadRes.status === 410) {
        Alert.alert(
          'Arquivo Expirado',
          'Este boleto temporário expirou no servidor (validade de 1 hora). Peça ao atendente para reenviar a 2ª via.'
        );
        return false;
      }
      throw new Error(`Servidor retornou HTTP ${downloadRes.status}`);
    }

    console.log('[DOWNLOAD] Arquivo salvo localmente em:', downloadRes.uri);

    // 1. ANDROID: Abre DIRETAMENTE no leitor de PDF nativo (Google Drive PDF, Adobe, Samsung Notes, etc.)
    // Evita abrir tela de compartilhamento (ACTION_SEND) e usa ACTION_VIEW com permissão de leitura
    if (Platform.OS === 'android') {
      try {
        const contentUri = await FileSystem.getContentUriAsync(downloadRes.uri);
        console.log('[DOWNLOAD ANDROID] Abrindo no leitor nativo via ContentUri:', contentUri);

        await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
          data: contentUri,
          flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
          type: 'application/pdf',
        });
        return true;
      } catch (intentErr) {
        console.warn('[DOWNLOAD ANDROID] Falha ao abrir leitor direto com intent, usando fallback:', intentErr);
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(downloadRes.uri, {
            mimeType: 'application/pdf',
            dialogTitle: 'Abrir Boleto (PDF)',
          });
          return true;
        }
      }
    }

    // 2. iOS: Abre com pré-visualização QuickLook nativa ou visualizador de documentos
    if (Platform.OS === 'ios') {
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(downloadRes.uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Boleto Bancário (PDF)',
          UTI: 'com.adobe.pdf',
        });
        return true;
      }
    }

    // 3. Fallback Web
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') {
        window.open(fileUrl, '_blank');
      }
      return true;
    }

    Alert.alert(
      'Boleto Baixado',
      'O boleto foi salvo no seu celular com sucesso!'
    );
    return true;
  } catch (error: any) {
    console.error('[DOWNLOAD ERROR]', error);
    Alert.alert(
      'Erro no Download',
      'Não foi possível baixar o arquivo do boleto. Verifique sua conexão e tente novamente.'
    );
    return false;
  }
}
