package com.radartinder.app.ui;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Shader;
import android.util.AttributeSet;
import android.view.View;

public class PremiumPanelView extends View {

    private Paint panelPaint;
    private Paint borderPaint;
    private Paint glowPaint;
    private RectF panelRect;
    private float animationPhase = 0f;

    public PremiumPanelView(Context context, AttributeSet attrs) {
        super(context, attrs);
        init();
    }

    private void init() {
        panelPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        borderPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        borderPaint.setStyle(Paint.Style.STROKE);
        borderPaint.setStrokeWidth(5f);

        glowPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        glowPaint.setStyle(Paint.Style.STROKE);
        glowPaint.setStrokeWidth(14f);
        
        // Software rendering needed for shadow effects in older Android versions
        setLayerType(LAYER_TYPE_SOFTWARE, null);
    }

    @Override
    protected void onSizeChanged(int w, int h, int oldw, int oldh) {
        super.onSizeChanged(w, h, oldw, oldh);
        panelRect = new RectF(25, 25, w - 25, h - 25);
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);

        animationPhase += 0.035f;
        float pulse = (float) (Math.sin(animationPhase * 3.2f) + 1.2) / 2.2f;

        // 1. Solid Background Gradient
        int darkBlue = Color.rgb(8, 14, 28);
        int deepPurple = Color.rgb(18, 5, 36);
        LinearGradient bgShader = new LinearGradient(0, 0, 0, getHeight(), darkBlue, deepPurple, Shader.TileMode.CLAMP);
        panelPaint.setShader(bgShader);
        canvas.drawRoundRect(panelRect, 45, 45, panelPaint);

        // 2. High Intensity Neon Glow Layer
        int neonPink = Color.rgb(255, 0, 212);
        int neonCyan = Color.rgb(0, 255, 235);
        int glowColor = (animationPhase % 10 > 5) ? neonPink : neonCyan; // Color cycling
        
        glowPaint.setColor(glowColor);
        glowPaint.setAlpha((int)(80 + pulse * 100));
        glowPaint.setShadowLayer(18f + pulse * 12f, 0, 0, glowColor);
        canvas.drawRoundRect(panelRect, 45, 45, glowPaint);

        // 3. Crisp Border Line
        borderPaint.setColor(Color.WHITE);
        borderPaint.setAlpha((int)(160 + pulse * 80));
        canvas.drawRoundRect(panelRect, 45, 45, borderPaint);

        invalidate(); // Continuous animation
    }
}
