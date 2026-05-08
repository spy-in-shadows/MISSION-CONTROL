// Haversine formula to calculate speed between two ISS positions
export function calculateSpeed(pos1, pos2, timeDiffSeconds) {
  const R = 6371;
  const toRad = (deg) => deg * (Math.PI / 180);
  const dLat = toRad(pos2.lat - pos1.lat);
  const dLon = toRad(pos2.lng - pos1.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(pos1.lat)) * Math.cos(toRad(pos2.lat)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  if (timeDiffSeconds <= 0) return 0;
  return (distance / timeDiffSeconds) * 3600;
}

// Get nearest place name from lat/lng using reverse geocoding
export async function getNearestPlace(lat, lng) {
  const oceanFallback = getOceanOrRegionName(lat, lng);

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`
    );
    if (!res.ok) throw new Error();
    const data = await res.json();
    if (data.address) {
      return (
        data.address.city ||
        data.address.town ||
        data.address.village ||
        data.address.county ||
        data.address.country ||
        oceanFallback
      );
    }
  } catch {
    // Use a clear non-guessed label if geocoding fails or the ISS is over water.
  }
  return oceanFallback;
}

function getOceanOrRegionName(lat, lng) {
  if (lat >= 66.5) return 'Arctic region';
  if (lat <= -60) return 'Southern Ocean / Antarctic region';
  if (lng >= -70 && lng <= 20) return 'Atlantic Ocean / nearby land';
  if (lng > 20 && lng <= 120) return 'Indian Ocean / nearby land';
  if (lng > 120 || lng <= -70) return 'Pacific Ocean / nearby land';
  return 'Over ocean / remote area';
}

// Format timestamp
export function formatTime(date) {
  return new Date(date).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}

export function formatDate(date) {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric'
  });
}

// LocalStorage helpers with expiry
export function setWithExpiry(key, value, ttlMs) {
  localStorage.setItem(key, JSON.stringify({ value, expiry: Date.now() + ttlMs }));
}

export function getWithExpiry(key) {
  const item = localStorage.getItem(key);
  if (!item) return null;
  try {
    const { value, expiry } = JSON.parse(item);
    if (Date.now() > expiry) { localStorage.removeItem(key); return null; }
    return value;
  } catch {
    return null;
  }
}
