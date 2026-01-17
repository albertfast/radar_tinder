#import <React/RCTViewManager.h>
#import <React/RCTBridgeModule.h>
#import <UIKit/UIKit.h>
#import <GLKit/GLKit.h>
#import <OpenGLES/ES2/gl.h>

@interface Radar3DViewManager : RCTViewManager

@end

@interface Radar3DView : GLKView

@property (nonatomic, assign) float rotationSpeed;
@property (nonatomic, assign) BOOL pulseEnabled;

@end