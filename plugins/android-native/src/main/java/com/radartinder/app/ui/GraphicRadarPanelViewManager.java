package com.radartinder.app.ui;

import androidx.annotation.NonNull;

import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.annotations.ReactProp;

public class GraphicRadarPanelViewManager extends SimpleViewManager<GraphicRadarPanelView> {
    private static final String REACT_CLASS = "RTGraphicRadarPanelView";

    @NonNull
    @Override
    public String getName() {
        return REACT_CLASS;
    }

    @NonNull
    @Override
    protected GraphicRadarPanelView createViewInstance(@NonNull ThemedReactContext context) {
        return new GraphicRadarPanelView(context);
    }

    @ReactProp(name = "signalLevel", defaultFloat = 0.55f)
    public void setSignalLevel(GraphicRadarPanelView view, float level) {
        view.setSignalLevel(level);
    }

    @ReactProp(name = "dangerLevel", defaultFloat = 0.15f)
    public void setDangerLevel(GraphicRadarPanelView view, float level) {
        view.setDangerLevel(level);
    }

    @ReactProp(name = "paused", defaultBoolean = false)
    public void setPaused(GraphicRadarPanelView view, boolean paused) {
        view.setPaused(paused);
    }
}
