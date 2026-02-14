import React from 'react';
import RadarScreen from './RadarScreen';

// Legacy route kept for backward compatibility. Forward to the main radar experience.
const MapScreen = (props: any) => {
  return <RadarScreen {...props} />;
};

export default MapScreen;
