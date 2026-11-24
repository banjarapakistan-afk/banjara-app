import * as Location from 'expo-location';
import { get } from '@/services/api';

/** Same rule as the website: rides whose pickup is within 10 km, widen up to 20 km. */
export const NEAR_DEFAULT_KM = 10;
export const NEAR_MAX_KM = 20;

/** A ride card from GET /api/discover (only the fields the nearby screen shows). */
export type NearbyRide = {
  id: string;
  title: string;
  subtitle: string;
  city: string;
  image: string | null;
  price: number | null;
  priceUnit: string | null;
  rating: number | null;
  verified: boolean;
  tags: string[];
  target: { type: string; id: string; providerId?: string };
  departsAt?: string;
  /** The operator's logo, for its marker on the map. */
  providerLogo?: string | null;
  location?: { lat: number; lng: number; address: string } | null;
  distanceKm?: number;
};

type DiscoverResponse = {
  total: number;
  items: NearbyRide[];
  near?: { lat: number; lng: number; radiusKm: number } | null;
};

/**
 * Rides with a pickup within `radiusKm` of the visitor, nearest first (filtered on the server).
 * `to` keeps only rides heading to that destination.
 */
export async function fetchNearbyRides(latitude: number, longitude: number, radiusKm: number, to?: string) {
  const data = await get<DiscoverResponse>('/discover', {
    params: {
      service: 'transport',
      view: 'map',
      near: `${latitude.toFixed(5)},${longitude.toFixed(5)}`,
      radius: radiusKm,
      limit: 100,
      ...(to ? { to } : {}),
    },
  });
  return data.items ?? [];
}

/** Every ride that has a pickup on the map (no distance limit): "Browse all rides". */
export async function fetchAllRides() {
  const data = await get<DiscoverResponse>('/discover', {
    params: { service: 'transport', view: 'map', limit: 100 },
  });
  return data.items ?? [];
}

/**
 * Why we couldn't get a position:
 * - denied: the visitor said no (we may ask again)
 * - blocked: the OS won't show the prompt again; it must be enabled in Settings
 * - services-off: location (GPS) is switched off on the device
 * - noanswer: the permission prompt never came back
 * - timeout: allowed, but the device didn't produce a position in time
 * - unavailable: anything else went wrong
 */
export type LocateFailure = 'denied' | 'blocked' | 'services-off' | 'noanswer' | 'timeout' | 'unavailable';
export type LocateResult =
  | { ok: true; latitude: number; longitude: number }
  | { ok: false; reason: LocateFailure };

/** asking: the permission prompt is up. locating: allowed, getting a fix. */
export type LocateStage = 'asking' | 'locating';

/** How long the permission prompt may stay unanswered. */
const ASK_LIMIT_MS = 30_000;
/** How long the device gets to produce a position once allowed. */
const FIX_LIMIT_MS = 15_000;

class LocateTimeout extends Error {}
function within<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new LocateTimeout()), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * Ask for the visitor's position once. Every step has a time limit, so this always settles
 * (a stuck permission prompt or GPS fix used to leave the loader spinning forever).
 * `onStage` reports progress for the UI.
 */
export async function locateVisitor(onStage?: (stage: LocateStage) => void): Promise<LocateResult> {
  try {
    const current = await Location.getForegroundPermissionsAsync();
    let granted = current.status === Location.PermissionStatus.GRANTED;
    if (!granted) {
      if (!current.canAskAgain) return { ok: false, reason: 'blocked' };
      onStage?.('asking');
      let permission: Location.LocationPermissionResponse;
      try {
        permission = await within(Location.requestForegroundPermissionsAsync(), ASK_LIMIT_MS);
      } catch (err) {
        return { ok: false, reason: err instanceof LocateTimeout ? 'noanswer' : 'unavailable' };
      }
      granted = permission.status === Location.PermissionStatus.GRANTED;
      if (!granted) return { ok: false, reason: permission.canAskAgain ? 'denied' : 'blocked' };
    }

    onStage?.('locating');
    if (!(await Location.hasServicesEnabledAsync())) return { ok: false, reason: 'services-off' };
    // A recent fix is instant; otherwise ask for a fresh one (about 100 m accuracy is plenty).
    const last = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 });
    if (last) return { ok: true, latitude: last.coords.latitude, longitude: last.coords.longitude };
    try {
      const position = await within(
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        FIX_LIMIT_MS,
      );
      return { ok: true, latitude: position.coords.latitude, longitude: position.coords.longitude };
    } catch (err) {
      // Out of time: an older fix is still better than nothing for a 10 km search.
      const stale = await Location.getLastKnownPositionAsync().catch(() => null);
      if (stale) return { ok: true, latitude: stale.coords.latitude, longitude: stale.coords.longitude };
      return { ok: false, reason: err instanceof LocateTimeout ? 'timeout' : 'unavailable' };
    }
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}

/** Android only: show the system "Turn on location" dialog. Resolves true if turned on. */
export async function askToTurnOnLocation(): Promise<boolean> {
  try {
    await Location.enableNetworkProviderAsync();
    return await Location.hasServicesEnabledAsync();
  } catch {
    return false;
  }
}

/** "0.4" -> "Under 1 km", "3.25" -> "3.3 km". */
export function distanceLabel(km: number | undefined) {
  if (km === undefined) return null;
  return km < 1 ? 'Under 1 km' : `${km.toFixed(1).replace(/\.0$/, '')} km`;
}
