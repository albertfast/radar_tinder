export const modernMapStyle = [
  // Base - charcoal petrol, tuned to avoid the heavy navy look.
  { elementType: 'geometry', stylers: [{ color: '#071016' }] },

  // Labels
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#D7E4E9' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#061015' }] },

  // Admin borders
  {
    featureType: 'administrative',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#28404B' }],
  },

  // Landscape fill
  {
    featureType: 'landscape',
    elementType: 'geometry',
    stylers: [{ color: '#0A151A' }],
  },
  {
    featureType: 'landscape.man_made',
    elementType: 'geometry',
    stylers: [{ color: '#0B171D' }],
  },

  // Parks
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#145136' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#97E8BE' }],
  },

  // Hide noisy POIs
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.medical', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.place_of_worship', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.school', stylers: [{ visibility: 'off' }] },

  // Local roads
  {
    featureType: 'road.local',
    elementType: 'geometry.fill',
    stylers: [{ color: '#21313C' }],
  },
  {
    featureType: 'road.local',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#101B23' }],
  },
  {
    featureType: 'road.local',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#B9C9D1' }],
  },

  // Arterial roads
  {
    featureType: 'road.arterial',
    elementType: 'geometry.fill',
    stylers: [{ color: '#35525A' }],
  },
  {
    featureType: 'road.arterial',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#13252B' }],
  },
  {
    featureType: 'road.arterial',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#D7E4E9' }],
  },

  // Highways
  {
    featureType: 'road.highway',
    elementType: 'geometry.fill',
    stylers: [{ color: '#1F8F86' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#0D3F3C' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#ECFFFB' }],
  },

  // Highway ramps/connectors
  {
    featureType: 'road.highway.controlled_access',
    elementType: 'geometry.fill',
    stylers: [{ color: '#229A91' }],
  },
  {
    featureType: 'road.highway.controlled_access',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#0D4D48' }],
  },

  // Transit
  {
    featureType: 'transit',
    elementType: 'geometry',
    stylers: [{ color: '#173039' }],
  },
  {
    featureType: 'transit.station',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#8ECFD2' }],
  },

  // Water
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#123C47' }],
  },
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#8ECFD2' }],
  },
];

export const modernRouteStyle = modernMapStyle;
