import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { sendTripLocations } from '@/services/intercity.service';
import { createLocationBuffer, type LocationBuffer } from '@/utils/locationBuffer';

/** Points per request (the API takes up to 500). */
const BATCH = 500;
/** ~4 hours at one point every 5 s: long Karakoram Highway dead zones fit. */
const MAX_BUFFERED = 3_000;
const MIN_GAP_MS = 5_000;
const FLUSH_EVERY_MS = 15_000;

export type SharingStatus = {
  /** Points saved on the phone, not yet accepted by the server. */
  waiting: number;
  offline: boolean;
  gpsError: string | null;
};

const storageKey = (tripId: string) => `banjara:intercity-locations:${tripId}`;

/** The buffer API is synchronous: hydrate from AsyncStorage once, then write through. */
async function openBuffer(tripId: string): Promise<LocationBuffer> {
  const key = storageKey(tripId);
  let cached: string | null = null;
  try {
    cached = await AsyncStorage.getItem(key);
  } catch {
    // Storage unavailable: keep points in memory only.
  }
  return createLocationBuffer({
    key,
    maxPoints: MAX_BUFFERED,
    storage: {
      getItem: () => cached,
      setItem: (_key, value) => {
        cached = value;
        void AsyncStorage.setItem(key, value).catch(() => undefined);
      },
    },
  });
}

/**
 * Shares the driver's position for each trip under way while this screen is open.
 * Every point is kept on the phone first and sent when there is signal, so a dead
 * zone delays the rider's map but never loses the trip.
 */
export function useTripLocationSharing(tripIds: string[]): SharingStatus {
  const [status, setStatus] = useState<SharingStatus>({ waiting: 0, offline: false, gpsError: null });
  const key = tripIds.join(',');
  const buffers = useRef(new Map<string, LocationBuffer>());

  useEffect(() => {
    const ids = key ? key.split(',') : [];
    if (!ids.length) {
      setStatus({ waiting: 0, offline: false, gpsError: null });
      return;
    }
    let live = true;
    let sending = false;
    let lastAdded = 0;
    let subscription: Location.LocationSubscription | null = null;
    const map = buffers.current;

    const waiting = () => [...map.values()].reduce((sum, buffer) => sum + buffer.size(), 0);
    const update = (patch: Partial<SharingStatus>) => live && setStatus((current) => ({ ...current, ...patch, waiting: waiting() }));

    const flush = async () => {
      if (sending) return;
      sending = true;
      let failed = false;
      try {
        for (const [tripId, buffer] of map) {
          // Keep sending while full batches remain (after a long dead zone).
          for (;;) {
            const points = buffer.drain(BATCH);
            if (!points.length) break;
            await sendTripLocations(tripId, points);
            buffer.ack(points.length);
            if (points.length < BATCH) break;
          }
        }
      } catch {
        // No signal or the server is busy: the points stay saved for the next try.
        failed = true;
      } finally {
        sending = false;
        update({ offline: failed });
      }
    };

    void (async () => {
      for (const id of ids) if (!map.has(id)) map.set(id, await openBuffer(id));
      for (const id of [...map.keys()]) if (!ids.includes(id)) map.delete(id);
      if (!live) return;
      update({});

      const permission = await Location.requestForegroundPermissionsAsync();
      if (!live) return;
      if (permission.status !== 'granted') {
        update({ gpsError: 'Location access is off. Allow it in Settings so the traveller can follow the trip.' });
        return;
      }
      subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: MIN_GAP_MS, distanceInterval: 10 },
        (position) => {
          if (position.timestamp - lastAdded < MIN_GAP_MS) return;
          lastAdded = position.timestamp;
          const { latitude, longitude, speed, heading } = position.coords;
          const point = {
            lat: latitude,
            lng: longitude,
            at: new Date(position.timestamp).toISOString(),
            ...(speed != null && Number.isFinite(speed) && speed >= 0 && speed <= 100 ? { speed } : {}),
            ...(heading != null && Number.isFinite(heading) && heading >= 0 && heading <= 360 ? { heading } : {}),
          };
          for (const buffer of map.values()) buffer.add(point);
          update({ gpsError: null });
        },
      );
      if (!live) subscription.remove();
    })().catch(() => update({ gpsError: 'Looking for GPS signal…' }));

    void flush();
    const timer = setInterval(() => void flush(), FLUSH_EVERY_MS);
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') void flush();
    });

    return () => {
      live = false;
      clearInterval(timer);
      appState.remove();
      subscription?.remove();
    };
  }, [key]);

  return status;
}
