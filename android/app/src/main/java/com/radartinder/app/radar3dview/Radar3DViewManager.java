package com.radartinder.app.radar3dview;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.common.MapBuilder;
import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.annotations.ReactProp;

import java.util.Map;

public class Radar3DViewManager extends SimpleViewManager<Radar3DView> {
    public static final String REACT_CLASS = "RTRadar3DView";
    ReactApplicationContext reactContext;

    public Radar3DViewManager(ReactApplicationContext reactContext) {
        this.reactContext = reactContext;
    }

    @NonNull
    @Override
    public String getName() {
        return REACT_CLASS;
    }

    @NonNull
    @Override
    protected Radar3DView createViewInstance(@NonNull ThemedReactContext reactContext) {
        return new Radar3DView(reactContext);
    }

    // Gerekirse özellikler burada eklenebilir
    @ReactProp(name = "rotationSpeed")
    public void setRotationSpeed(Radar3DView view, float speed) {
        // Rotasyon hızını ayarla (gelecekte kullanmak için)
    }

    @ReactProp(name = "pulseEnabled")
    public void setPulseEnabled(Radar3DView view, boolean enabled) {
        // Pulse animasyonunu ayarla (gelecekte kullanmak için)
    }

    @Override
    public Map<String, Object> getExportedCustomDirectEventTypeConstants() {
        return MapBuilder.of(
            "onRadarClick", MapBuilder.of("registrationName", "onRadarClick")
        );
    }

    @Nullable
    @Override
    public Map<String, Object> getExportedViewConstants() {
        return MapBuilder.of(
            "Mode", MapBuilder.of(
                "Basic", 0,
                "Advanced", 1
            )
        );
    }
}
