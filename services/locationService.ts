import { get, patch, post, put } from '@/services/api';
import type {
  BusinessLocationPayload,
  PlaceSearchResult,
  StructuredAddress,
} from '@/types/location';

/** Recent searches in memory: re-typing or going back never waits for the network twice. */
const SEARCH_TTL_MS = 10 * 60 * 1000;
const SEARCH_CACHE_MAX = 100;
const searchCache = new Map<string, { at: number; value: Promise<PlaceSearchResult[]> }>();

/** Searches all of Pakistan (curated Banjara places + OpenStreetMap) through the backend. */
export async function searchPlaces(query: string, limit = 5): Promise<PlaceSearchResult[]> {
  const q = query.trim().replace(/\s+/g, ' ');
  if (q.length < 2) return [];
  const key = `${q.toLowerCase()}|${limit}`;
  const hit = searchCache.get(key);
  if (hit && Date.now() - hit.at < SEARCH_TTL_MS) return hit.value;
  const value = get<PlaceSearchResult[]>('/businesses/search', {
    params: { q, limit },
  }).then((data) => (Array.isArray(data) ? data : []));
  // Cache the promise so identical searches in flight share one request.
  searchCache.set(key, { at: Date.now(), value });
  if (searchCache.size > SEARCH_CACHE_MAX) searchCache.delete(searchCache.keys().next().value!);
  try {
    const result = await value;
    if (!result.length) searchCache.delete(key);
    return result;
  } catch (error) {
    searchCache.delete(key);
    throw error;
  }
}

export async function reverseGeocode(
  latitude: number,
  longitude: number
): Promise<PlaceSearchResult> {
  return get<PlaceSearchResult>('/businesses/reverse', {
    params: { latitude, longitude },
  });
}

export async function getMyBusinessLocation(): Promise<BusinessLocationPayload> {
  return get<BusinessLocationPayload>('/providers/me/location');
}

export async function saveMyBusinessLocation(input: {
  address: StructuredAddress;
  latitude: number;
  longitude: number;
}): Promise<BusinessLocationPayload> {
  const body = {
    address: input.address,
    location: {
      type: 'Point' as const,
      coordinates: [input.longitude, input.latitude] as [number, number],
    },
  };
  try {
    return await put<BusinessLocationPayload>('/providers/me/location', body);
  } catch {
    return patch<BusinessLocationPayload>('/providers/me/location', body);
  }
}

export async function saveBusinessLocationById(
  businessId: string,
  input: { address: StructuredAddress; latitude: number; longitude: number }
): Promise<BusinessLocationPayload> {
  return post<BusinessLocationPayload>(`/businesses/${businessId}/location`, {
    address: input.address,
    location: {
      type: 'Point',
      coordinates: [input.longitude, input.latitude],
    },
  });
}

export async function findNearbyBusinesses(params: {
  latitude: number;
  longitude: number;
  radius?: number;
  category?: string;
}) {
  return get<{
    items: Array<{ business: Record<string, unknown>; distanceMeters: number }>;
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }>('/businesses/nearby', { params });
}
