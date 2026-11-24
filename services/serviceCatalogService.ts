import { get } from '@/services/api';
import { asArray, type AnyRecord } from '@/services/mappers';
import { SERVICE_OPTIONS, normalizeServiceKey } from '@/constants/providerOptions';

export type CatalogService = {
  id: string;
  key: string;
  label: string;
  emoji: string;
  description: string;
  active: boolean;
  sortOrder: number;
};

function shortDescription(key: string, description: string) {
  const known = SERVICE_OPTIONS.find((item) => item.type === key)?.description;
  const text = (known || description || '').trim();
  if (text.length <= 72) return text;
  return `${text.slice(0, 69).trimEnd()}…`;
}

function mapService(raw: AnyRecord): CatalogService {
  const key = normalizeServiceKey(String(raw.key ?? ''));
  const known = SERVICE_OPTIONS.find((item) => item.type === key);
  return {
    id: String(raw._id ?? raw.id ?? key),
    key,
    label: String(raw.label ?? known?.label ?? key),
    emoji: String(raw.emoji ?? known?.emoji ?? '✨'),
    description: shortDescription(key, String(raw.description ?? known?.description ?? '')),
    active: raw.active !== false,
    sortOrder: Number(raw.sortOrder ?? 0),
  };
}

/** Active services providers can choose (falls back to built-in 5). */
export async function listActiveServices(): Promise<CatalogService[]> {
  try {
    const data = await get<unknown>('/services');
    const items = asArray<AnyRecord>(data).map(mapService).filter((item) => item.key);
    if (items.length) {
      return items.sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
    }
  } catch {
    // offline / API down — use local defaults
  }
  return SERVICE_OPTIONS.map((item, index) => ({
    id: item.type,
    key: item.type,
    label: item.label,
    emoji: item.emoji,
    description: item.description,
    active: true,
    sortOrder: index + 1,
  }));
}

export type ServiceCount = { approved: number; registered: number };
export type ProviderCounts = { services: Record<string, ServiceCount>; total: ServiceCount };

/** How many real providers are on BANJARA for each service (public numbers only). */
export async function getProviderCounts(): Promise<ProviderCounts> {
  const data = await get<AnyRecord>('/providers/public/counts');
  const read = (value: unknown): ServiceCount => {
    const row = (value ?? {}) as AnyRecord;
    return {
      approved: Math.max(0, Number(row.approved) || 0),
      registered: Math.max(0, Number(row.registered) || 0),
    };
  };
  const raw = (data?.services ?? {}) as AnyRecord;
  const services: Record<string, ServiceCount> = {};
  for (const [key, value] of Object.entries(raw)) services[normalizeServiceKey(key)] = read(value);
  return { services, total: read(data?.total) };
}
