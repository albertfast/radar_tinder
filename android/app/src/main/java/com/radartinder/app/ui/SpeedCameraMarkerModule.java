package com.radartinder.app.ui;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

public class SpeedCameraMarkerModule extends ReactContextBaseJavaModule {
    public static final String NAME = "RTSpeedCameraMarker";

    public SpeedCameraMarkerModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @NonNull
    @Override
    public String getName() {
        return NAME;
    }

    @ReactMethod
    public void getDataUri(double sizePx, Promise promise) {
        try {
            int size = (int) Math.round(sizePx);
            if (size <= 0) {
                size = 96;
            }
            String uri = SpeedCameraMarkerRenderer.renderToDataUri(size);
            promise.resolve(uri);
        } catch (Exception error) {
            promise.reject("SPEED_CAMERA_RENDER_ERROR", error);
        }
    }
}
