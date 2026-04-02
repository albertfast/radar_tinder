package com.radartinder.app.ui;

import android.content.Context;
import android.graphics.BlurMaskFilter;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RadialGradient;
import android.graphics.RectF;
import android.graphics.Shader;
import android.os.SystemClock;
import android.util.AttributeSet;
import android.view.View;

import java.util.Random;

public class GraphicRadarPanelView extends View {
    private static final float TAU = (float) (Math.PI * 2.0);
    private static final int PARTICLE_COUNT = 118;

    private final Paint fillPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint strokePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint glowPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint gridPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint particlePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint textPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path sweepPath = new Path();

    private final Particle[] particles = new Particle[PARTICLE_COUNT];

    private float signalLevel = 0.55f;
    private float dangerLevel = 0.15f;
    private boolean paused;
    private long startTimeMs;

    public GraphicRadarPanelView(Context context) {
        this(context, null);
    }

    public GraphicRadarPanelView(Context context, AttributeSet attrs) {
        super(context, attrs);
        setLayerType(LAYER_TYPE_SOFTWARE, null);
        initParticles();
        startTimeMs = SystemClock.uptimeMillis();
    }

    private void initParticles() {
        Random rng = new Random(404L);
        for (int i = 0; i < PARTICLE_COUNT; i++) {
            particles[i] = new Particle(
                rng.nextFloat() * TAU,
                0.12f + rng.nextFloat() * 0.88f,
                0.25f + rng.nextFloat() * 0.75f,
                rng.nextFloat() * TAU,
                rng.nextFloat(),
                1.2f + rng.nextFloat() * 2.8f
            );
        }
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        float w = getWidth();
        float h = getHeight();
        if (w <= 0 || h <= 0) {
            return;
        }

        float t = (SystemClock.uptimeMillis() - startTimeMs) / 1000f;
        drawBackdrop(canvas, w, h);
        drawFloorGrid(canvas, w, h, t);
        drawSignalBands(canvas, w, h, t);

        float radarSize = Math.min(w * 0.58f, h * 0.92f);
        float cx = w * 0.54f;
        float cy = h * 0.58f;
        drawRadar(canvas, cx, cy, radarSize, t);

        if (!paused) {
            postInvalidateOnAnimation();
        }
    }

    private void drawBackdrop(Canvas canvas, float w, float h) {
        fillPaint.setShader(new LinearGradient(
            0f,
            0f,
            0f,
            h,
            new int[]{Color.rgb(5, 8, 26), Color.rgb(3, 8, 26)},
            null,
            Shader.TileMode.CLAMP
        ));
        canvas.drawRect(0f, 0f, w, h, fillPaint);

        fillPaint.setShader(new RadialGradient(
            w * 0.10f,
            h * 0.52f,
            w * 0.52f,
            new int[]{withAlpha(Color.rgb(18, 190, 196), 90), withAlpha(Color.rgb(18, 190, 196), 0)},
            new float[]{0f, 1f},
            Shader.TileMode.CLAMP
        ));
        canvas.drawRect(0f, 0f, w, h, fillPaint);

        fillPaint.setShader(new RadialGradient(
            w * 0.85f,
            h * 0.62f,
            w * 0.46f,
            new int[]{withAlpha(Color.rgb(255, 130, 44), 82), withAlpha(Color.rgb(255, 130, 44), 0)},
            new float[]{0f, 1f},
            Shader.TileMode.CLAMP
        ));
        canvas.drawRect(0f, 0f, w, h, fillPaint);

        fillPaint.setShader(null);
    }

    private void drawFloorGrid(Canvas canvas, float w, float h, float t) {
        canvas.save();
        canvas.translate(w * 0.5f, h * 0.86f);
        canvas.scale(1f, 0.50f);

        gridPaint.setStyle(Paint.Style.STROKE);
        gridPaint.setStrokeWidth(dp(1f));
        gridPaint.setColor(withAlpha(Color.rgb(38, 88, 122), 66));

        for (int i = -9; i <= 9; i++) {
            float x = i * w * 0.085f;
            canvas.drawLine(x, 0f, x * 1.42f, -h * 0.72f, gridPaint);
        }

        for (int i = 0; i < 10; i++) {
            float y = -i * h * 0.07f;
            canvas.drawLine(-w * 0.75f, y, w * 0.75f, y, gridPaint);
        }

        canvas.restore();
    }

    private void drawSignalBands(Canvas canvas, float w, float h, float t) {
        float centerY = h * 0.60f;
        float wave = (float) Math.sin(t * 1.2f) * h * 0.012f;

        strokePaint.setStyle(Paint.Style.STROKE);
        strokePaint.setStrokeWidth(dp(1.2f));
        strokePaint.setColor(withAlpha(Color.rgb(40, 180, 210), 42));

        for (int i = 0; i < 3; i++) {
            float y = centerY + wave + (i - 1) * h * 0.035f;
            canvas.drawLine(0f, y, w, y, strokePaint);
        }

        fillPaint.setShader(new LinearGradient(
            0f,
            centerY,
            w,
            centerY,
            new int[]{
                withAlpha(Color.rgb(44, 214, 218), 0),
                withAlpha(Color.rgb(44, 214, 218), 48),
                withAlpha(Color.rgb(255, 182, 110), 54),
                withAlpha(Color.rgb(255, 182, 110), 0)
            },
            new float[]{0f, 0.28f, 0.74f, 1f},
            Shader.TileMode.CLAMP
        ));
        canvas.drawRect(0f, centerY - h * 0.05f, w, centerY + h * 0.05f, fillPaint);
        fillPaint.setShader(null);
    }

    private void drawRadar(Canvas canvas, float cx, float cy, float size, float t) {
        float radius = size * 0.5f;
        float planeRx = radius * 1.02f;
        float planeRy = radius * 0.82f;

        fillPaint.setShader(new RadialGradient(
            cx, cy, radius,
            new int[]{withAlpha(Color.rgb(6, 14, 24), 224), withAlpha(Color.rgb(4, 8, 16), 240)},
            new float[]{0f, 1f},
            Shader.TileMode.CLAMP
        ));
        canvas.drawCircle(cx, cy, radius, fillPaint);
        fillPaint.setShader(null);

        strokePaint.setStyle(Paint.Style.STROKE);
        strokePaint.setStrokeWidth(dp(1.5f));
        strokePaint.setColor(withAlpha(Color.rgb(21, 228, 214), 56));
        canvas.drawCircle(cx, cy, radius, strokePaint);
        strokePaint.setColor(withAlpha(Color.rgb(255, 182, 110), 24));
        canvas.drawCircle(cx, cy, radius * 1.08f, strokePaint);

        for (int i = 0; i < 7; i++) {
            float lat = -0.72f + i * 0.24f;
            float ry = radius * (0.12f + (1f - Math.abs(lat)) * 0.18f);
            float y = cy + lat * radius * 0.55f;
            strokePaint.setColor(withAlpha(lerpColor(Color.rgb(47, 167, 255), Color.rgb(21, 228, 214), i / 5f), 38 + i * 6));
            canvas.drawOval(new RectF(cx - radius * 0.9f, y - ry, cx + radius * 0.9f, y + ry), strokePaint);
        }

        for (int i = 0; i < 5; i++) {
            canvas.save();
            canvas.rotate((float) Math.sin(t * (0.8f + i * 0.18f)) * (8f + i * 4f), cx, cy);
            float rx = radius * (0.44f + i * 0.11f);
            float ry = radius * 0.92f;
            strokePaint.setColor(withAlpha(Color.rgb(20, 128, 200), 24 + i * 10));
            canvas.drawOval(new RectF(cx - rx, cy - ry, cx + rx, cy + ry), strokePaint);
            canvas.restore();
        }

        fillPaint.setStyle(Paint.Style.FILL);
        fillPaint.setColor(withAlpha(Color.rgb(6, 18, 26), 228));
        canvas.drawOval(new RectF(cx - planeRx, cy - planeRy, cx + planeRx, cy + planeRy), fillPaint);

        for (int i = 0; i < 8; i++) {
            float ratio = 0.12f + i * 0.105f;
            float rx = planeRx * ratio;
            float ry = planeRy * ratio;
            strokePaint.setColor(withAlpha((i % 2 == 0) ? Color.rgb(255, 177, 112) : Color.rgb(37, 214, 224), 84 - i * 8));
            canvas.drawOval(new RectF(cx - rx, cy - ry, cx + rx, cy + ry), strokePaint);
        }

        for (int i = 0; i < 3; i++) {
            canvas.save();
            canvas.rotate((float) Math.sin(t * (0.7f + i * 0.25f)) * (10f + i * 5f), cx, cy);
            float rx = planeRx * (0.35f + i * 0.15f);
            float ry = planeRy * (0.35f + i * 0.15f);
            strokePaint.setColor(withAlpha(i == 0 ? Color.rgb(255, 182, 110) : Color.rgb(44, 224, 218), 70 - i * 14));
            canvas.drawOval(new RectF(cx - rx, cy - ry, cx + rx, cy + ry), strokePaint);
            canvas.restore();
        }

        drawRadarEchoes(canvas, cx, cy, planeRx, planeRy, t);
        drawSweep(canvas, cx, cy, planeRx, planeRy, t);
        drawParticles(canvas, cx, cy, planeRx, planeRy, t);
        drawCenterCore(canvas, cx, cy, radius, t);
    }

    private void drawRadarEchoes(Canvas canvas, float cx, float cy, float rx, float ry, float t) {
        strokePaint.setStyle(Paint.Style.STROKE);
        strokePaint.setStrokeWidth(dp(1.4f));

        for (int i = 0; i < 4; i++) {
            float phase = (t * (0.75f + i * 0.16f) + i * 0.42f) % 1f;
            float scale = 0.22f + phase * 0.9f;
            int alpha = (int) (54f * (1f - phase));
            strokePaint.setColor(withAlpha(i % 2 == 0 ? Color.rgb(44, 214, 218) : Color.rgb(255, 182, 110), alpha));
            canvas.drawOval(new RectF(cx - rx * scale, cy - ry * scale, cx + rx * scale, cy + ry * scale), strokePaint);
        }
    }

    private void drawSweep(Canvas canvas, float cx, float cy, float rx, float ry, float t) {
        float angle = t * (1.05f + signalLevel * 0.2f);
        for (int idx = 0; idx < 2; idx++) {
            float arc = idx == 0 ? 0.42f : 0.32f;
            float sweepAngle = angle + idx * 0.84f;
            int sweepColor = idx == 0 ? Color.rgb(255, 176, 110) : Color.rgb(47, 215, 223);
            int fillAlpha = idx == 0 ? 104 : 60;

            sweepPath.reset();
            sweepPath.moveTo(cx, cy);
            for (int seg = 0; seg < 40; seg++) {
                float a = sweepAngle - arc / 2f + arc * seg / 39f;
                sweepPath.lineTo(cx + (float) Math.cos(a) * rx * 0.96f, cy + (float) Math.sin(a) * ry * 0.96f);
            }
            sweepPath.close();

            glowPaint.setStyle(Paint.Style.FILL);
            glowPaint.setColor(withAlpha(sweepColor, fillAlpha));
            glowPaint.setMaskFilter(new BlurMaskFilter(dp(idx == 0 ? 7f : 4f), BlurMaskFilter.Blur.NORMAL));
            canvas.drawPath(sweepPath, glowPaint);
            glowPaint.setMaskFilter(null);
        }
    }

    private void drawParticles(Canvas canvas, float cx, float cy, float rx, float ry, float t) {
        for (int i = 0; i < PARTICLE_COUNT; i++) {
            Particle p = particles[i];
            float a = p.orbit + t * p.speed;
            float x = cx + (float) Math.cos(a) * rx * p.radius * 0.84f;
            float y = cy + (float) Math.sin(a) * ry * p.radius * 0.84f;
            float pulse = (float) Math.sin(t * 1.6f + p.phase) * dp(4f);
            float size = dp(p.size * (0.8f + signalLevel * 0.3f));

            float threatMix = p.danger > 0.76f ? 0.5f + dangerLevel * 0.3f : 0f;
            int color = lerpColor(Color.rgb(34, 242, 209), Color.rgb(241, 78, 208), threatMix);
            int alpha = (int) (86 + p.danger * 120f);

            particlePaint.setStyle(Paint.Style.FILL);
            particlePaint.setColor(withAlpha(color, alpha));
            particlePaint.setMaskFilter(new BlurMaskFilter(size * 0.75f, BlurMaskFilter.Blur.NORMAL));
            canvas.drawCircle(x, y + pulse, size, particlePaint);
            particlePaint.setMaskFilter(null);
        }
    }

    private void drawCenterCore(Canvas canvas, float cx, float cy, float radius, float t) {
        float pulse = 0.5f + 0.5f * (float) Math.sin(t * 2.4f);
        float coreR = dp(11f + pulse * 4f);

        glowPaint.setShader(new RadialGradient(
            cx, cy, coreR * 3.2f,
            new int[]{withAlpha(Color.rgb(255, 177, 112), 42), withAlpha(Color.rgb(255, 177, 112), 0)},
            new float[]{0f, 1f},
            Shader.TileMode.CLAMP
        ));
        glowPaint.setStyle(Paint.Style.FILL);
        canvas.drawCircle(cx, cy, coreR * 3.2f, glowPaint);
        glowPaint.setShader(null);

        fillPaint.setShader(new RadialGradient(
            cx, cy, coreR,
            new int[]{withAlpha(Color.rgb(243, 246, 249), 255), withAlpha(Color.rgb(116, 233, 228), 230), withAlpha(Color.rgb(116, 233, 228), 0)},
            new float[]{0f, 0.5f, 1f},
            Shader.TileMode.CLAMP
        ));
        canvas.drawCircle(cx, cy, coreR, fillPaint);
        fillPaint.setShader(null);
    }

    public void setSignalLevel(float level) {
        signalLevel = clamp01(level);
        invalidate();
    }

    public void setDangerLevel(float level) {
        dangerLevel = clamp01(level);
        invalidate();
    }

    public void setPaused(boolean value) {
        paused = value;
        if (!paused) {
            postInvalidateOnAnimation();
        }
    }

    private float dp(float value) {
        return value * getResources().getDisplayMetrics().density;
    }

    private static float clamp01(float value) {
        return Math.max(0f, Math.min(1f, value));
    }

    private static int withAlpha(int color, int alpha) {
        return Color.argb(Math.max(0, Math.min(255, alpha)), Color.red(color), Color.green(color), Color.blue(color));
    }

    private static int lerpColor(int a, int b, float t) {
        t = clamp01(t);
        return Color.rgb(
            (int) (Color.red(a) + (Color.red(b) - Color.red(a)) * t),
            (int) (Color.green(a) + (Color.green(b) - Color.green(a)) * t),
            (int) (Color.blue(a) + (Color.blue(b) - Color.blue(a)) * t)
        );
    }

    private static final class Particle {
        final float orbit;
        final float radius;
        final float speed;
        final float phase;
        final float danger;
        final float size;

        Particle(float orbit, float radius, float speed, float phase, float danger, float size) {
            this.orbit = orbit;
            this.radius = radius;
            this.speed = speed;
            this.phase = phase;
            this.danger = danger;
            this.size = size;
        }
    }
}
