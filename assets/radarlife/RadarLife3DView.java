package com.radartinder.app.radarlife;

import android.content.Context;
import android.graphics.PixelFormat;
import android.opengl.GLSurfaceView;

/**
 * GLSurfaceView wrapper that hosts the Radar Life 3D Conway renderer.
 * Receives props from React Native via {@link RadarLife3DViewManager}.
 */
public class RadarLife3DView extends GLSurfaceView {

    private final LifeGrid grid;
    private final RadarLife3DRenderer renderer;
    private boolean isPaused = false;

    public RadarLife3DView(Context context) {
        super(context);

        grid = new LifeGrid();
        renderer = new RadarLife3DRenderer(grid);

        // GLES 2.0
        setEGLContextClientVersion(2);

        // Translucent background so RN views behind are visible
        setZOrderOnTop(true);
        setEGLConfigChooser(8, 8, 8, 8, 16, 0);
        getHolder().setFormat(PixelFormat.TRANSLUCENT);

        setRenderer(renderer);
        setRenderMode(RENDERMODE_CONTINUOUSLY);
    }

    // ── Prop setters (called from RN UI thread) ──

    public void setRotationSpeed(float speed) {
        renderer.setRotationSpeed(speed);
    }

    public void setPulseEnabled(boolean enabled) {
        renderer.setPulseEnabled(enabled);
    }

    public void setSignalLevel(float level) {
        grid.setSignalLevel(level);
        renderer.setSignalLevel(level);
    }

    public void setDangerLevel(float level) {
        grid.setDangerLevel(level);
        renderer.setDangerLevel(level);
    }

    public void setThemeVariant(String variant) {
        // Currently only 'contour_orbit' is supported; reserved for future themes
    }

    public void setPaused(boolean paused) {
        this.isPaused = paused;
        if (paused) {
            setRenderMode(RENDERMODE_WHEN_DIRTY);
        } else {
            setRenderMode(RENDERMODE_CONTINUOUSLY);
        }
    }

    @Override
    protected void onDetachedFromWindow() {
        setPaused(true);
        super.onDetachedFromWindow();
    }
}
