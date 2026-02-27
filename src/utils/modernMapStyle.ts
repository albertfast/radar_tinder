export const modernMapStyle = [
  // Base – deep space navy (not black, has depth)
  { elementType: 'geometry', stylers: [{ color: '#0a1628' }] },

  // Labels
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#ddeeff' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#060e1a' }] },

  // Admin borders
  {
    featureType: 'administrative',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#1a3660' }],
  },

  // Landscape fill – richer midnight blue
  {
    featureType: 'landscape',
    elementType: 'geometry',
    stylers: [{ color: '#0c1a2e' }],
  },
  {
    featureType: 'landscape.man_made',
    elementType: 'geometry',
    stylers: [{ color: '#0e1f38' }],
  },

  // Parks – vivid jungle green
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#0b3d28' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#22c77a' }],
  },

  // Hide noisy POIs
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.medical', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.place_of_worship', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.school', stylers: [{ visibility: 'off' }] },

  // Local roads – visible slate blue (much lighter than base)
  {
    featureType: 'road.local',
    elementType: 'geometry.fill',
    stylers: [{ color: '#1c3566' }],
  },
  {
    featureType: 'road.local',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#28478a' }],
  },
  {
    featureType: 'road.local',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#9ab8e8' }],
  },

  // Arterial roads – bright mid-blue
  {
    featureType: 'road.arterial',
    elementType: 'geometry.fill',
    stylers: [{ color: '#1e4a9e' }],
  },
  {
    featureType: 'road.arterial',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#3065c9' }],
  },
  {
    featureType: 'road.arterial',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#b8d4ff' }],
  },

  // Highways – vivid royal blue + bright cyan outline
  {
    featureType: 'road.highway',
    elementType: 'geometry.fill',
    stylers: [{ color: '#0e5ce6' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#38bdf8' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#ffffff' }],
  },

  // Highway ramps/connectors
  {
    featureType: 'road.highway.controlled_access',
    elementType: 'geometry.fill',
    stylers: [{ color: '#1565e0' }],
  },
  {
    featureType: 'road.highway.controlled_access',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#4db6f5' }],
  },

  // Transit
  {
    featureType: 'transit',
    elementType: 'geometry',
    stylers: [{ color: '#0f2545' }],
  },
  {
    featureType: 'transit.station',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#7eb8ff' }],
  },

  // Water – deep ocean blue with shimmer
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#04213f' }],
  },
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#5eb0ff' }],
  },
];

export const modernRouteStyle = modernMapStyle;
