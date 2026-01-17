package com.radartinder.app.radar3dview;

import android.content.Context;
import android.opengl.GLSurfaceView;
import android.util.AttributeSet;
import android.view.View;
import androidx.annotation.Nullable;

public class Radar3DView extends GLSurfaceView {
    private Radar3DRenderer renderer;

    public Radar3DView(Context context) {
        super(context);
        init();
    }

    public Radar3DView(Context context, @Nullable AttributeSet attrs) {
        super(context, attrs);
        init();
    }

    private void init() {
        // OpenGL ES 2.0 kullanarak context ayarla
        setEGLContextClientVersion(2);
        
        // Renderer oluştur ve ayarla
        renderer = new Radar3DRenderer(getContext());
        setRenderer(renderer);
        
        // Sadece gerektiğinde yeniden çiz (performans için)
        setRenderMode(GLSurfaceView.RENDERMODE_CONTINUOUSLY);
    }

    @Override
    protected void onAttachedToWindow() {
        super.onAttachedToWindow();
        if (renderer != null) {
            renderer.onResume();
        }
    }

    @Override
    protected void onDetachedFromWindow() {
        super.onDetachedFromWindow();
        if (renderer != null) {
            renderer.onPause();
        }
    }
}