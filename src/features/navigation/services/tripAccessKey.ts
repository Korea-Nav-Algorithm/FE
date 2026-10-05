/** A 256-bit bearer key is persisted before the first remote trip request. */
export function createTripAccessKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
