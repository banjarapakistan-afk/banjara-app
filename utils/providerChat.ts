import { Alert } from 'react-native';
import { getApiErrorMessage } from '@/services/apiError';
import { getPublicProviderById } from '@/services/providerService';
import { pushPath } from '@/utils/navigation';

/**
 * Opens the customer's in-app chat with a provider when only the provider profile
 * id is known (same lookup + route as the tour details "Message" action).
 */
export async function openProviderChatByProfileId(providerId?: string): Promise<void> {
  if (!providerId) return;
  try {
    const provider = await getPublicProviderById(providerId);
    if (!provider?.userId) {
      Alert.alert('Messaging unavailable', 'This provider cannot be messaged right now.');
      return;
    }
    pushPath(`/(customer)/messages/${provider.userId}`);
  } catch (failure) {
    Alert.alert('Could not open conversation', getApiErrorMessage(failure));
  }
}
