package com.radartinder.app.radarlife;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.annotations.ReactProp;

/**
 * React Native ViewManager that bridges {@link RadarLife3DView} to JS as "RTRadarLife3DView".
 */
public class RadarLife3DViewManager extends SimpleViewManager<RadarLife3DView> {

    private static final String REACT_CLASS = "RTRadarLife3DView";

    @NonNull
    @Override
    public String getName() {
        return REACT_CLASS;
    }

    @NonNull
    @Override
    protected RadarLife3DView createViewInstance(@NonNull ThemedReactContext context) {
        return new RadarLife3DView(context);
    }

    @ReactProp(name = "rotationSpeed", defaultFloat = 1f)
    public void setRotationSpeed(RadarLife3DView view, float speed) {
        view.setRotationSpeed(speed);
    }

    @ReactProp(name = "pulseEnabled", defaultBoolean = true)
    public void setPulseEnabled(RadarLife3DView view, boolean enabled) {
        view.setPulseEnabled(enabled);
    }

    @ReactProp(name = "signalLevel", defaultFloat = 0f)
    public void setSignalLevel(RadarLife3DView view, float level) {
        view.setSignalLevel(level);
    }

    @ReactProp(name = "dangerLevel", defaultFloat = 0f)
    public void setDangerLevel(RadarLife3DView view, float level) {
        view.setDangerLevel(level);
    }

    @ReactProp(name = "themeVariant")
    public void setThemeVariant(RadarLife3DView view, @Nullable String variant) {
        view.setThemeVariant(variant != null ? variant : "contour_orbit");
    }

    @ReactProp(name = "paused", defaultBoolean = false)
    public void setPaused(RadarLife3DView view, boolean paused) {
        view.setPaused(paused);
    }

    @Override
    public void onDropViewInstance(@NonNull RadarLife3DView view) {
        view.setPaused(true);
        super.onDropViewInstance(view);
    }
}
