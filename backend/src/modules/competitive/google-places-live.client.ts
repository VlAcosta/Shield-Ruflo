import { env } from '../../config/env.js';
import { AppError } from '../../core/errors/app-error.js';

const BASE_URL = 'https://places.googleapis.com/v1';
const SEARCH_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.rating',
  'places.userRatingCount',
  'places.websiteUri',
  'places.googleMapsUri',
].join(',');
const DETAILS_FIELD_MASK = [
  'id',
  'displayName',
  'formattedAddress',
  'location',
  'rating',
  'userRatingCount',
  'websiteUri',
  'googleMapsUri',
  'reviews',
  'attributions',
].join(',');

export type GooglePlacesLiveReview = {
  name?: string;
  relativePublishTimeDescription?: string;
  rating?: number;
  text?: { text?: string; languageCode?: string };
  originalText?: { text?: string; languageCode?: string };
  publishTime?: string;
  googleMapsUri?: string;
  authorAttribution?: { displayName?: string; uri?: string; photoUri?: string };
};

export type GooglePlacesLivePlace = {
  id: string;
  displayName?: { text?: string; languageCode?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  rating?: number;
  userRatingCount?: number;
  websiteUri?: string;
  googleMapsUri?: string;
  reviews?: GooglePlacesLiveReview[];
  attributions?: Array<{ provider?: string; providerUri?: string }>;
};

type SearchResponse = { places?: GooglePlacesLivePlace[] };

function configured(): boolean {
  return Boolean(env.GOOGLE_PLACES_ENABLED && env.GOOGLE_PLACES_API_KEY);
}

function assertConfigured() {
  if (!configured()) {
    throw new AppError({
      code: 'GOOGLE_PLACES_NOT_CONFIGURED',
      message: 'Google Places live-источник не настроен на сервере',
      statusCode: 409,
    });
  }
}

async function googleFetch<T>(url: string, init: RequestInit, fieldMask: string): Promise<T> {
  assertConfigured();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.GOOGLE_PLACES_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'X-Goog-Api-Key': env.GOOGLE_PLACES_API_KEY,
        'X-Goog-FieldMask': fieldMask,
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok) {
      throw new AppError({
        code: response.status === 429 ? 'GOOGLE_PLACES_RATE_LIMITED' : 'GOOGLE_PLACES_REQUEST_FAILED',
        message: response.status === 429 ? 'Google Places временно ограничил запросы' : 'Не удалось получить live-данные Google Places',
        statusCode: response.status === 429 ? 429 : 502,
      });
    }
    return await response.json() as T;
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new AppError({ code: 'GOOGLE_PLACES_TIMEOUT', message: 'Google Places не ответил вовремя', statusCode: 504 });
    }
    throw new AppError({ code: 'GOOGLE_PLACES_REQUEST_FAILED', message: 'Не удалось получить live-данные Google Places', statusCode: 502 });
  } finally {
    clearTimeout(timeout);
  }
}

export function googlePlacesAvailability() {
  return configured()
    ? { configured: true, storagePolicy: 'LIVE_ONLY' as const, maxReviewSample: 5, attributionRequired: true }
    : { configured: false, storagePolicy: 'LIVE_ONLY' as const, maxReviewSample: 5, attributionRequired: true, reasonCode: 'GOOGLE_PLACES_NOT_CONFIGURED' };
}

export async function searchGooglePlacesLive(textQuery: string, languageCode = 'ru'): Promise<GooglePlacesLivePlace[]> {
  const payload = await googleFetch<SearchResponse>(`${BASE_URL}/places:searchText`, {
    method: 'POST',
    body: JSON.stringify({ textQuery, languageCode, maxResultCount: 10 }),
  }, SEARCH_FIELD_MASK);
  return (payload.places ?? []).slice(0, 10);
}

export async function getGooglePlaceLive(placeId: string, languageCode = 'ru'): Promise<GooglePlacesLivePlace> {
  if (!/^[A-Za-z0-9_-]{8,512}$/.test(placeId)) {
    throw new AppError({ code: 'GOOGLE_PLACE_ID_INVALID', message: 'Некорректный Google Place ID', statusCode: 400 });
  }
  const query = new URLSearchParams({ languageCode });
  return googleFetch<GooglePlacesLivePlace>(`${BASE_URL}/places/${encodeURIComponent(placeId)}?${query}`, { method: 'GET' }, DETAILS_FIELD_MASK);
}
