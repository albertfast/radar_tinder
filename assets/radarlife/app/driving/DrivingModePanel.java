package com.radartinder.app.driving;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.util.AttributeSet;
import android.view.View;

public class DrivingModePanel extends View {
    private Paint neonPaint;
    private float pulsePhase = 0f;

    public DrivingModePanel(Context context, AttributeSet attrs) {
        super(context, attrs);
        neonPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        neonPaint.setStyle(Paint.Style.STROKE);
        neonPaint.setStrokeWidth(8f);
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        pulsePhase += 0.04f;
        float alpha = (float) (Math.sin(pulsePhase) + 1.2) * 0.4f;

        RectF rect = new RectF(15, 15, getWidth() - 15, getHeight() - 15);
        
        // Neon Purple Glow Layer
        neonPaint.setStrokeWidth(12f);
        neonPaint.setColor(Color.rgb(150, 0, 255));
        neonPaint.setAlpha((int)(alpha * 120));
        canvas.drawRoundRect(rect, 60, 60, neonPaint);

        // Core Neon Line
        neonPaint.setStrokeWidth(4f);
        neonPaint.setColor(Color.WHITE);
        neonPaint.setAlpha(200);
        canvas.drawRoundRect(rect, 60, 60, neonPaint);

        invalidate();
    }
}
