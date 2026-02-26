#import <React/RCTViewManager.h>

@interface RCT_EXTERN_REMAP_MODULE(RTRadarLife3DView, RTRadarLife3DViewManager, RCTViewManager)

RCT_EXPORT_VIEW_PROPERTY(rotationSpeed, NSNumber)
RCT_EXPORT_VIEW_PROPERTY(pulseEnabled, BOOL)
RCT_EXPORT_VIEW_PROPERTY(signalLevel, NSNumber)
RCT_EXPORT_VIEW_PROPERTY(dangerLevel, NSNumber)
RCT_EXPORT_VIEW_PROPERTY(themeVariant, NSString)
RCT_EXPORT_VIEW_PROPERTY(paused, BOOL)

@end
