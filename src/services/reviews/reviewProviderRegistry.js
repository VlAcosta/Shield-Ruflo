// The concrete transport/API support is intentionally not hard-coded yet.
// Each provider adapter can declare capabilities after the real integration method is selected.
export const REVIEW_PROVIDERS = Object.freeze([
  { id: 'yandex', label: 'Яндекс', platform: 'Яндекс', capabilities: [], integration: 'unresolved' },
  { id: '2gis', label: '2GIS', platform: '2GIS', capabilities: [], integration: 'unresolved' },
  { id: 'ozon', label: 'Ozon', platform: 'Ozon', capabilities: [], integration: 'unresolved' },
  { id: 'otzovik', label: 'Отзовик', platform: 'Отзовик', capabilities: [], integration: 'unresolved' },
  { id: 'wb', label: 'Wildberries', platform: 'WB', capabilities: [], integration: 'unresolved' },
]);

export function getReviewProviderByPlatform(platform) {
  return REVIEW_PROVIDERS.find((item) => item.platform === platform) || null;
}

export function providerSupports(platform, capability) {
  return Boolean(getReviewProviderByPlatform(platform)?.capabilities.includes(capability));
}
