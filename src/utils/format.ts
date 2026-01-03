export const formatDistance = (km: number, unit: 'metric' | 'imperial'): string => {
  if (unit === 'imperial') {
    const miles = km * 0.621371;
    return `${miles.toFixed(1)} mi`;
  }
  return `${km.toFixed(1)} km`;
};

export const formatSpeed = (kmh: number, unit: 'metric' | 'imperial'): string => {
  if (unit === 'imperial') {
    const mph = kmh * 0.621371;
    return `${Math.round(mph)} MPH`;
  }
  return `${Math.round(kmh)} KM/H`;
};
