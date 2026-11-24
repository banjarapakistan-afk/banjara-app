import { createURL } from 'expo-linking';
import { useLocalSearchParams } from 'expo-router';
import { Alert, Share } from 'react-native';
import {
  RestaurantDetailsFrame,
  RestaurantDetailsPresentation,
} from '@/components/restaurants/RestaurantDetailsPresentation';
import { ErrorState, LoadingState } from '@/components/ui/EmptyState';
import { useProviderFavorite } from '@/hooks/useProviderFavorite';
import { useRestaurant } from '@/hooks/useRestaurants';
import { getApiErrorMessage } from '@/services/apiError';
import { paramId, safeBack } from '@/utils/navigation';
import { openProviderChatByProfileId } from '@/utils/providerChat';

export default function RestaurantProfileScreen() {
  const params = useLocalSearchParams<{ id: string | string[] }>();
  const id = paramId(params.id);
  const { restaurant, loading, refresh } = useRestaurant(id);
  const favorite = useProviderFavorite(id);
  const onBack = () => safeBack('/(customer)/(tabs)/search');

  if (!restaurant)
    return (
      <RestaurantDetailsFrame onBack={onBack}>
        {loading ? (
          <LoadingState title="Loading restaurant..." />
        ) : (
          <ErrorState
            title="Restaurant unavailable"
            message="This restaurant could not be loaded. Please try again."
            onRetry={() => void refresh()}
          />
        )}
      </RestaurantDetailsFrame>
    );

  const providerId = restaurant.providerId;
  const onShare = () => {
    void Share.share({
      message: `${restaurant.name}${restaurant.city ? ` · ${restaurant.city}` : ''}\n${createURL(`/restaurants/${id}`)}`,
    }).catch((error) => Alert.alert('Could not share restaurant', getApiErrorMessage(error)));
  };

  return (
    <RestaurantDetailsPresentation
      key={restaurant.id}
      restaurant={restaurant}
      saved={favorite.saved}
      saving={favorite.busy}
      refreshing={loading}
      onRefresh={() => void refresh()}
      onBack={onBack}
      onShare={onShare}
      onSave={() =>
        void favorite
          .toggle()
          .catch((error) => Alert.alert('Could not save restaurant', getApiErrorMessage(error)))
      }
      onMessage={providerId ? () => void openProviderChatByProfileId(providerId) : undefined}
    />
  );
}
