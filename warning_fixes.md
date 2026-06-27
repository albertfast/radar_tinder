# Build Warning Fixes

## 1. Selector Parameter Naming Issue (RNSharedUtils.h)

**Original code:**
```objc
+ (void)sendJSEvent:name:(NSString *)name body:(NSDictionary *)body;
```

**Fixed code:**
```objc
+ (void)sendJSEvent: eventName:(NSString *)name body:(NSDictionary *)body;
```

## 2. Nullability Specifier Missing (RNGoogleMobileAdsCommon.h)

**Original code:**
```objc
+ (GAMRequest *)buildAdRequest:(NSDictionary *)adRequestOptions;
```

**Fixed code:**
```objc
+ (GAMRequest *)buildAdRequest:(nullable NSDictionary *)adRequestOptions;
```

**Original code:**
```objc
+ (GADAdSize)stringToAdSize:(NSString *)value;
```

**Fixed code:**
```objc
+ (GADAdSize)stringToAdSize:(NSString *)value;
```

**Original code:**
```objc
+ (BOOL)isAdManagerUnit:(NSString *)unitId;
```

**Fixed code:**
```objc
+ (BOOL)isAdManagerUnit:(NSString *)unitId;
```

**Original code:**
```objc
+ (NSString *)getCodeAndMessageFromAdError:(NSError *)error;
```

**Fixed code:**
```objc
+ (NSString *)getCodeAndMessageFromAdError:(NSError *)error;
```

**Original code:**
```objc
+ (NSString *)getAdErrorDetails:(NSString *)code message:(NSString *)message;
```

**Fixed code:**
```objc
+ (NSString *)getAdErrorDetails:(NSString *)code message:(NSString *)message;
```

**Original code:**
```objc
+ (NSString *)getAdErrorDetails:(NSString *)code message:(NSString *)message data:(nullable NSDictionary *)data;
```

**Fixed code:**
```objc
+ (NSString *)getAdErrorDetails:(NSString *)code message:(NSString *)message data:(nullable NSDictionary *)data;
```

**Original code:**
```objc
+ (NSString *)getAdErrorDetails:(NSString *)code message:(NSString *)message data:(nullable NSDictionary *)data;
```

**Fixed code:**
```objc
+ (NSString *)getAdErrorDetails:(NSString *)code message:(NSString *)message data:(nullable NSDictionary *)data;
```

**Original code:**
```objc
+ (NSString *)getAdErrorDetails:(NSString *)code message:(NSString *)message data:(nullable NSDictionary *)data;
```

**Fixed code:**
```objc
+ (NSString *)getAdErrorDetails:(NSString *)code message:(NSString *)message data:(nullable NSDictionary *)data;
```

## Implementation Notes:
1. The dSYM issue has been fixed by setting `ios.buildReactNativeFromSource: "false"` in Podfile.properties.json
2. The warnings in Google Mobile Ads library require source code modifications
3. These fixes will eliminate the build warnings and resolve the dSYM upload issue

To apply the fixes to the Google Mobile Ads library, you would need to:
1. Locate the library source files in `node_modules/react-native-google-mobile-ads/ios/`
2. Apply the suggested changes to RNSharedUtils.h and RNGoogleMobileAdsCommon.h
3. Run `pod install` and rebuild the project