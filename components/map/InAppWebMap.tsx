import { useCallback, useEffect, useMemo, useRef, type ComponentRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import {
  isValidCoord,
  regionForPoints,
  type MapPerson,
  type MapVehicleInfo,
} from '@/components/map/mapHelpers';
import { Colors } from '@/constants/colors';
import { Radius } from '@/constants/spacing';
import type { Coordinates } from '@/types/route';

export type InAppMapMarker = {
  id: string;
  title: string;
  subtitle?: string;
  coordinate: Coordinates;
  selected?: boolean;
};

type InAppWebMapProps = {
  markers: InAppMapMarker[];
  userLocation?: Coordinates | null;
  traveler?: MapPerson | null;
  vehicle?: MapVehicleInfo | null;
  showRoute?: boolean;
  /** Road-following path (lat/lng). Prefer over straight line. */
  roadRoute?: Coordinates[] | null;
  height?: number;
  fill?: boolean;
  onSelectMarker?: (id: string) => void;
  /** When set, tapping the map reports a coordinate (drop-pin). */
  onPressMap?: (coordinate: Coordinates) => void;
  /** "Rides near me": draw this search radius (km) around `userLocation` and frame it. */
  searchRadiusKm?: number | null;
  /** Px at the bottom of the map hidden by an overlay (e.g. a sheet); framing keeps clear of it. */
  obscuredBottom?: number;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function initials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/** What can change without rebuilding the page: selection, operator marker, route, framing. */
type LiveState = {
  selectedId: string | null;
  vehicle: { agency: string; initials: string; logo: string } | null;
  routePath: [number, number][] | null;
  obscuredBottom: number;
};

function liveState(
  markers: InAppMapMarker[],
  userLocation: Coordinates | null | undefined,
  showRoute: boolean | undefined,
  vehicle: MapVehicleInfo | null | undefined,
  roadRoute: Coordinates[] | null | undefined,
  obscuredBottom: number
): LiveState {
  const selected = markers.find((m) => m.selected && isValidCoord(m.coordinate)) ?? null;
  const road =
    roadRoute && roadRoute.length > 1
      ? roadRoute.filter(isValidCoord).map((c) => [c.latitude, c.longitude] as [number, number])
      : null;
  const target = selected ?? markers.find((m) => isValidCoord(m.coordinate)) ?? null;
  const straight =
    showRoute && isValidCoord(userLocation) && target
      ? ([
          [userLocation.latitude, userLocation.longitude],
          [target.coordinate.latitude, target.coordinate.longitude],
        ] as [number, number][])
      : null;
  return {
    selectedId: selected?.id ?? null,
    vehicle: vehicle
      ? {
          agency: escapeHtml(vehicle.agencyName || vehicle.name),
          initials: escapeHtml(initials(vehicle.agencyName || vehicle.name || 'V')),
          logo: vehicle.agencyLogo
            ? escapeHtml(vehicle.agencyLogo)
            : vehicle.imageUrl
              ? escapeHtml(vehicle.imageUrl)
              : '',
        }
      : null,
    routePath: showRoute ? (road ?? straight) : null,
    obscuredBottom: Math.max(0, Math.round(obscuredBottom)),
  };
}

/**
 * The Leaflet page the WebView shows. It is built from the things that rarely change (pins, the
 * customer, the search circle); selection, the operator marker, the route and framing are applied
 * by `window.__map.update(state)` so changing them never reloads the page (no blink).
 */
export function buildHtml(
  markers: InAppMapMarker[],
  userLocation?: Coordinates | null,
  showRoute?: boolean,
  traveler?: MapPerson | null,
  vehicle?: MapVehicleInfo | null,
  roadRoute?: Coordinates[] | null,
  dropPin = false,
  searchRadiusKm?: number | null,
  obscuredBottom = 0
) {
  const points = markers
    .filter((m) => isValidCoord(m.coordinate))
    .map((m) => ({
      id: m.id,
      title: escapeHtml(m.title),
      subtitle: escapeHtml(m.subtitle ?? ''),
      lat: m.coordinate.latitude,
      lng: m.coordinate.longitude,
    }));

  const region = regionForPoints(
    [
      ...points.map((p) => ({ latitude: p.lat, longitude: p.lng })),
      ...(isValidCoord(userLocation) ? [userLocation] : []),
    ],
    points[0]
      ? { latitude: points[0].lat, longitude: points[0].lng }
      : { latitude: 33.6844, longitude: 73.0479 }
  );

  const travelerPayload = traveler
    ? {
        name: escapeHtml(traveler.name),
        initials: escapeHtml(initials(traveler.name || 'You')),
        avatarUrl: traveler.avatarUrl ? escapeHtml(traveler.avatarUrl) : '',
        phone: traveler.phone ? escapeHtml(traveler.phone) : '',
      }
    : null;

  const initial = liveState(markers, userLocation, showRoute, vehicle, roadRoute, obscuredBottom);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map { margin:0; padding:0; height:100%; width:100%; background:#e9efe9; }
    .pin {
      background:#0f9b98; color:#fff; border:2px solid #fff; border-radius:999px;
      width:28px; height:28px; display:flex; align-items:center; justify-content:center;
      font:700 12px/1 system-ui,sans-serif; box-shadow:0 2px 8px rgba(0,0,0,.25);
      transition:transform .18s ease, background .18s ease;
    }
    .pin.selected { background:#C2410C; transform:scale(1.15); }
    .person-mark, .vehicle-mark {
      display:flex; flex-direction:column; align-items:center; gap:2px;
    }
    .vehicle-mark { animation:pop .22s ease-out; }
    @keyframes pop { from { transform:scale(.6); opacity:0; } }
    .avatar {
      width:36px; height:36px; border-radius:999px; border:3px solid #fff;
      background:#DC2626; color:#fff; display:flex; align-items:center; justify-content:center;
      font:700 11px/1 system-ui,sans-serif; box-shadow:0 0 0 4px rgba(220,38,38,.28), 0 2px 10px rgba(0,0,0,.28);
      overflow:hidden;
    }
    .avatar img { width:100%; height:100%; object-fit:cover; }
    .avatar.provider { background:#0f9b98; box-shadow:0 2px 10px rgba(0,0,0,.28); }
    .label {
      background:rgba(15,61,58,.92); color:#fff; border-radius:999px;
      padding:2px 8px; font:600 10px/1.2 system-ui,sans-serif; white-space:nowrap;
      max-width:170px; overflow:hidden; text-overflow:ellipsis;
    }
    .label.traveler { background:#DC2626; }
    /* Anonymous "you are here": a small dot, so it doesn't cover nearby pins. */
    .me-dot {
      width:18px; height:18px; border-radius:999px; background:#2563EB; border:3px solid #fff;
      box-shadow:0 0 0 6px rgba(37,99,235,.22), 0 2px 6px rgba(0,0,0,.3); box-sizing:border-box;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const markers = ${JSON.stringify(points)};
    const user = ${JSON.stringify(
      isValidCoord(userLocation) ? { lat: userLocation.latitude, lng: userLocation.longitude } : null
    )};
    const traveler = ${JSON.stringify(travelerPayload)};
    const searchKm = ${JSON.stringify(searchRadiusKm ?? null)};
    const map = L.map('map', { zoomControl: true }).setView(
      [${region.latitude}, ${region.longitude}],
      12
    );
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    function post(message) {
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(message));
    }

    // Static layers: pins, the customer, the search circle.
    const overview = [];
    const pins = {};
    markers.forEach(function (m, index) {
      const marker = L.marker([m.lat, m.lng], {
        icon: L.divIcon({ className: '', html: '<div class="pin">' + (index + 1) + '</div>', iconSize: [28, 28], iconAnchor: [14, 28] }),
      }).addTo(map);
      marker.bindPopup('<strong>' + m.title + '</strong><br/>' + (m.subtitle || ''));
      marker.on('click', function () { post({ type: 'select', id: m.id }); });
      pins[m.id] = { marker: marker, index: index, lat: m.lat, lng: m.lng };
      overview.push([m.lat, m.lng]);
    });

    if (user) {
      const name = traveler ? traveler.name : 'You';
      const avatarInner = traveler && traveler.avatarUrl
        ? '<img src="' + traveler.avatarUrl + '" alt="" />'
        : (traveler ? traveler.initials : 'You');
      const userIcon = traveler
        ? L.divIcon({
            className: '',
            html: '<div class="person-mark"><div class="avatar">' + avatarInner + '</div><div class="label traveler">' + name + '</div></div>',
            iconSize: [48, 56],
            iconAnchor: [24, 28],
          })
        : L.divIcon({ className: '', html: '<div class="me-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });
      const popup = traveler
        ? '<strong>' + traveler.name + '</strong> (traveler)<br/>' + (traveler.phone || 'Your location')
        : 'You are here';
      // Below the ride pins, so a pickup right next to the customer stays tappable.
      L.marker([user.lat, user.lng], { icon: userIcon, zIndexOffset: -1000 }).addTo(map).bindPopup(popup);
      if (traveler) L.circle([user.lat, user.lng], {
        radius: 90, color: '#DC2626', weight: 2, fillColor: '#DC2626', fillOpacity: 0.12,
      }).addTo(map);
      overview.push([user.lat, user.lng]);
      if (searchKm) {
        // "Rides near me": show the search area and frame all of it.
        const area = L.circle([user.lat, user.lng], {
          radius: searchKm * 1000, color: '#0F9B98', weight: 2, dashArray: '6 8',
          fillColor: '#16B364', fillOpacity: 0.07, interactive: false,
        }).addTo(map);
        const box = area.getBounds();
        overview.push([box.getSouth(), box.getWest()], [box.getNorth(), box.getEast()]);
      }
    }

    // Live layers, replaced on every update.
    let live = L.layerGroup().addTo(map);
    let lastKey = null;

    function pinIcon(p, selected) {
      return L.divIcon({
        className: '',
        html: '<div class="pin ' + (selected ? 'selected' : '') + '">' + (p.index + 1) + '</div>',
        iconSize: [28, 28],
        iconAnchor: [14, 28],
      });
    }

    function update(state) {
      Object.keys(pins).forEach(function (id) {
        const p = pins[id];
        const selected = id === state.selectedId;
        p.marker.setIcon(pinIcon(p, selected));
        p.marker.setZIndexOffset(selected ? 1000 : 0);
      });

      live.clearLayers();
      const picked = state.selectedId ? pins[state.selectedId] : null;
      if (picked && state.vehicle) {
        const v = state.vehicle;
        const logoHtml = v.logo ? '<img src="' + v.logo + '" alt="" />' : v.initials;
        L.marker([picked.lat, picked.lng], {
          icon: L.divIcon({
            className: '',
            html: '<div class="vehicle-mark"><div class="avatar provider">' + logoHtml + '</div><div class="label">' + v.agency + '</div></div>',
            iconSize: [48, 56],
            iconAnchor: [24, -8],
          }),
          interactive: false,
          zIndexOffset: 900,
        }).addTo(live);
      }
      const path = state.routePath;
      if (path && path.length > 1) {
        L.polyline(path, { color: '#0F9B98', weight: 5, opacity: 0.92, lineJoin: 'round', lineCap: 'round' }).addTo(live);
        const redEnd = Math.min(12, Math.max(2, Math.floor(path.length * 0.08)));
        const start = path.slice(0, redEnd);
        if (start.length > 1) {
          L.polyline(start, { color: '#DC2626', weight: 6, opacity: 0.95, lineJoin: 'round', lineCap: 'round' }).addTo(live);
        }
      }

      // Frame what matters in the part of the map that isn't covered (e.g. by a bottom sheet).
      // Re-frame only when the selection, route or covered area changes, not on every repaint.
      const key = [state.selectedId, path ? path.length : 0, state.obscuredBottom].join('|');
      if (key === lastKey) return;
      const first = lastKey === null;
      lastKey = key;
      const pad = { paddingTopLeft: [40, 40], paddingBottomRight: [40, 40 + state.obscuredBottom] };
      if (picked) {
        const focus = [[picked.lat, picked.lng]];
        if (path) path.forEach(function (pt) { focus.push(pt); });
        if (user) focus.push([user.lat, user.lng]);
        map.flyToBounds(focus, Object.assign({ maxZoom: 16, duration: 0.6 }, pad));
      } else if (overview.length > 1) {
        if (first) map.fitBounds(overview, pad);
        else map.flyToBounds(overview, Object.assign({ duration: 0.5 }, pad));
      } else if (overview.length === 1) {
        map.setView(overview[0], ${dropPin ? 16 : 14});
      }
    }

    window.__map = { update: update };
    update(${JSON.stringify(initial)});

    ${
      dropPin
        ? `map.on('click', function (e) {
      post({ type: 'press', latitude: e.latlng.lat, longitude: e.latlng.lng });
    });`
        : ''
    }
  </script>
</body>
</html>`;
}

export function InAppWebMap({
  markers,
  userLocation,
  traveler,
  vehicle,
  showRoute,
  roadRoute,
  height,
  fill = false,
  onSelectMarker,
  onPressMap,
  searchRadiusKm,
  obscuredBottom = 0,
}: InAppWebMapProps) {
  const web = useRef<ComponentRef<typeof WebView>>(null);
  const loaded = useRef(false);

  // Rebuild the page only when the pins themselves, the customer or the circle change.
  const pinsKey = markers
    .map((m) => `${m.id}:${m.coordinate.latitude},${m.coordinate.longitude}:${m.title}:${m.subtitle ?? ''}`)
    .join('|');
  const userKey = isValidCoord(userLocation) ? `${userLocation.latitude},${userLocation.longitude}` : '';
  const travelerKey = traveler ? `${traveler.name}|${traveler.avatarUrl ?? ''}|${traveler.phone ?? ''}` : '';
  const dropPin = Boolean(onPressMap);

  // Live state (selection, operator, route, covered area) goes in by message, not by reload.
  const state = useMemo(
    () => liveState(markers, userLocation, showRoute, vehicle, roadRoute, obscuredBottom),
    [markers, userLocation, showRoute, vehicle, roadRoute, obscuredBottom]
  );
  const latestState = useRef(state);
  useEffect(() => {
    latestState.current = state;
  });

  const html = useMemo(
    () => {
      loaded.current = false;
      const s = latestState.current;
      // Seed the page with the live state as of now so it opens already framed.
      return buildHtml(
        markers,
        userLocation,
        showRoute,
        traveler,
        vehicle,
        roadRoute,
        dropPin,
        searchRadiusKm,
        s.obscuredBottom
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pinsKey, userKey, travelerKey, dropPin, searchRadiusKm]
  );

  const push = useCallback((next: LiveState) => {
    web.current?.injectJavaScript(`window.__map && window.__map.update(${JSON.stringify(next)}); true;`);
  }, []);
  const stateKey = JSON.stringify(state);
  useEffect(() => {
    if (loaded.current) push(latestState.current);
  }, [stateKey, push]);

  const resolvedHeight = fill ? undefined : (height ?? 280);

  return (
    <View
      style={[styles.wrap, fill ? [styles.fill, styles.wrapFill] : { height: resolvedHeight }]}
    >
      <WebView
        ref={web}
        originWhitelist={['*']}
        source={{ html }}
        style={styles.web}
        onLoadEnd={() => {
          loaded.current = true;
          // Anything that changed while the page was loading.
          push(latestState.current);
        }}
        onMessage={(event) => {
          try {
            const data = JSON.parse(event.nativeEvent.data) as {
              type?: string;
              id?: string;
              latitude?: number;
              longitude?: number;
            };
            if (data.type === 'select' && data.id) onSelectMarker?.(data.id);
            if (
              data.type === 'press' &&
              typeof data.latitude === 'number' &&
              typeof data.longitude === 'number'
            ) {
              onPressMap?.({ latitude: data.latitude, longitude: data.longitude });
            }
          } catch {
            // ignore
          }
        }}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="always"
        setSupportMultipleWindows={false}
        allowsInlineMediaPlayback
        nestedScrollEnabled
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: Radius['2xl'],
    overflow: 'hidden',
    backgroundColor: Colors.primarySoft,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  wrapFill: {
    borderRadius: 0,
    borderWidth: 0,
    flex: 1,
  },
  fill: {
    flex: 1,
  },
  web: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
