package com.radartinder.app.radarlife;

import android.content.Context;
import android.opengl.GLSurfaceView;
import android.util.AttributeSet;
import android.graphics.PixelFormat;

public class RadarLife3DView extends GLSurfaceView {
    private final RadarLife3DRenderer renderer;
    private final LifeGrid grid;

    public RadarLife3DView(Context context, AttributeSet attrs) {
        super(context, attrs);
        setEGLConfigChooser(8, 8, 8, 8, 16, 0);
        getHolder().setFormat(PixelFormat.TRANSLUCENT);
        setZOrderOnTop(true);
        setEGLContextClientVersion(2);

        grid = new LifeGrid();
        renderer = new RadarLife3DRenderer(grid);
        setRenderer(renderer);
        setRenderMode(GLSurfaceView.RENDERMODE_CONTINUOUSLY);
    }

    public void restartSimulation() {
        grid.seed();
    }
}
