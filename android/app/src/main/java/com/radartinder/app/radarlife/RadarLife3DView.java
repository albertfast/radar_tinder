package com.radartinder.app.radarlife;

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

public class RadarLife3DView extends View {
    private static final float TAU = (float) (Math.PI * 2.0);
    private static final int PARTICLE_COUNT = 96;

    private static final int COLOR_SHELL_FILL = Color.rgb(15, 8, 25);
    private static final int COLOR_SHELL_EDGE = Color.rgb(0, 255, 255);
    private static final int COLOR_RADAR_CYAN = Color.rgb(0, 255, 200);
    private static final int COLOR_RADAR_BLUE = Color.rgb(100, 200, 255);
    private static final int COLOR_RADAR_RED = Color.rgb(255, 0, 150);
    private static final int COLOR_RADAR_HOT = Color.rgb(255, 50, 200);
    private static final int COLOR_WHITE = Color.rgb(255, 255, 255);

    private final Paint fillPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint strokePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint glowPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint particlePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint linePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path sweepPath = new Path();

    private final Particle[] particles = new Particle[PARTICLE_COUNT];

    private float rotationSpeed = 1f;
    private boolean pulseEnabled = true;
    private float signalLevel = 0f;
    private float dangerLevel = 0f;
    private boolean paused;
    private String themeVariant = "contour_orbit";
    private long startTimeMs;

    public RadarLife3DView(Context context) {
        this(context, null);
    }

    public RadarLife3DView(Context context, AttributeSet attrs) {
        super(context, attrs);
        setLayerType(LAYER_TYPE_SOFTWARE, null);
        initParticles();
        startTimeMs = SystemClock.uptimeMillis();
    }

    private void initParticles() {
        Random rng = new Random(1337L);
        for (int i = 0; i < PARTICLE_COUNT; i++) {
            particles[i] = new Particle(
                rng.nextFloat() * TAU,
                0.10f + rng.nextFloat() * 0.94f,
                0.22f + rng.nextFloat() * 0.68f,
                rng.nextFloat() * TAU,
                rng.nextFloat(),
                -0.24f + rng.nextFloat() * 0.74f,
                1.4f + rng.nextFloat() * 2.8f
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

        float size = Math.min(w, h);
        float cx = w * 0.5f;
        float cy = h * 0.54f;
        float shellR = size * 0.39f;
        float planeRx = size * 0.42f;
        float planeRy = size * 0.16f;
        float t = ((SystemClock.uptimeMillis() - startTimeMs) / 1000f) * Math.max(0.2f, rotationSpeed) * 0.9f;

        drawWorldShell(canvas, cx, cy, shellR, t);
        drawRadarPlane(canvas, cx, cy, planeRx, planeRy, shellR, t);

        if (!paused) {
            postInvalidateOnAnimation();
        }
    }

    private void drawWorldShell(Canvas canvas, float cx, float cy, float shellR, float t) {
        fillPaint.setStyle(Paint.Style.FILL);
        fillPaint.setColor(withAlpha(COLOR_SHELL_FILL, 118));
        canvas.drawCircle(cx, cy, shellR, fillPaint);

        strokePaint.setStyle(Paint.Style.STROKE);
        strokePaint.setStrokeWidth(dp(1.6f));
        strokePaint.setColor(withAlpha(COLOR_SHELL_EDGE, 42));
        canvas.drawCircle(cx, cy, shellR, strokePaint);

        float[] latitudes = {-0.68f, -0.42f, -0.18f, 0.12f, 0.38f, 0.62f};
        for (int i = 0; i < latitudes.length; i++) {
            float y = cy + latitudes[i] * shellR;
            float rx = shellR * (1.0f - Math.abs(latitudes[i]) * 0.52f);
            float ry = rx * 0.26f;
            strokePaint.setStrokeWidth(dp(1.35f));
            strokePaint.setColor(withAlpha(lerpColor(COLOR_RADAR_BLUE, COLOR_RADAR_CYAN, i / 5f), 24 + i * 5));
            canvas.drawOval(new RectF(cx - rx, y - ry, cx + rx, y + ry), strokePaint);
        }

        for (int i = 0; i < 4; i++) {
            canvas.save();
            canvas.rotate((float) Math.toDegrees(t * 0.78f) + i * 31f, cx, cy);
            float rx = shellR * (0.72f + i * 0.07f);
            float ry = shellR * 0.96f;
            strokePaint.setStrokeWidth(dp(0.9f));
            strokePaint.setColor(withAlpha(Color.rgb(95, 206, 255), 18 + i * 4));
            canvas.drawOval(new RectF(cx - rx, cy - ry, cx + rx, cy + ry), strokePaint);
            canvas.restore();
        }
    }

    private void drawRadarPlane(Canvas canvas, float cx, float cy, float planeRx, float planeRy, float shellR, float t) {
        fillPaint.setStyle(Paint.Style.FILL);
        fillPaint.setColor(withAlpha(Color.rgb(6, 18, 36), 184));
        canvas.drawOval(new RectF(cx - planeRx, cy - planeRy, cx + planeRx, cy + planeRy), fillPaint);

        fillPaint.setColor(withAlpha(Color.rgb(5, 28, 50), 126));
        canvas.drawOval(new RectF(cx - planeRx * 0.88f, cy - planeRy * 0.88f, cx + planeRx * 0.88f, cy + planeRy * 0.88f), fillPaint);

        for (int i = 0; i < 7; i++) {
            float ratio = 0.16f + i * 0.12f;
            float rx = planeRx * ratio;
            float ry = planeRy * ratio;
            strokePaint.setStrokeWidth(dp(1.4f));
            strokePaint.setColor(withAlpha((i % 2 == 0) ? COLOR_RADAR_CYAN : COLOR_RADAR_BLUE, 76 - i * 8));
            canvas.drawOval(new RectF(cx - rx, cy - ry, cx + rx, cy + ry), strokePaint);
        }

        for (int i = 0; i < 4; i++) {
            canvas.save();
            canvas.rotate((float) Math.sin(t * (0.8f + i * 0.21f)) * (9f + i * 4f), cx, cy);
            float rx = planeRx * (0.34f + i * 0.13f);
            float ry = planeRy * (0.36f + i * 0.12f);
            strokePaint.setStrokeWidth(dp(1.5f));
            strokePaint.setColor(withAlpha(i != 1 ? COLOR_RADAR_CYAN : COLOR_RADAR_BLUE, 58 - i * 10));
            canvas.drawOval(new RectF(cx - rx, cy - ry, cx + rx, cy + ry), strokePaint);
            canvas.restore();
        }

        drawSweep(canvas, cx, cy, planeRx, planeRy, t, 0, 0.42f, Color.rgb(80, 225, 216), 104, 200);
        drawSweep(canvas, cx, cy, planeRx, planeRy, t, 1, 0.32f, Color.rgb(70, 182, 255), 60, 120);
        drawParticles(canvas, cx, cy, planeRx, planeRy, t);
        drawCore(canvas, cx, cy, shellR, t);
    }

    private void drawSweep(Canvas canvas, float cx, float cy, float planeRx, float planeRy, float t, int idx, float arc, int color, int fillAlpha, int lineAlpha) {
        float angle = t * (1.0f + idx * 0.22f) + idx * 0.84f;
        sweepPath.reset();
        sweepPath.moveTo(cx, cy);
        for (int seg = 0; seg < 40; seg++) {
            float a = angle - arc / 2f + arc * seg / 39f;
            sweepPath.lineTo(cx + (float) Math.cos(a) * planeRx * 0.96f, cy + (float) Math.sin(a) * planeRy * 0.96f);
        }
        sweepPath.close();

        glowPaint.setStyle(Paint.Style.FILL);
        glowPaint.setColor(withAlpha(color, fillAlpha));
        glowPaint.setMaskFilter(new BlurMaskFilter(dp(6f - idx * 1.5f), BlurMaskFilter.Blur.NORMAL));
        canvas.drawPath(sweepPath, glowPaint);
        glowPaint.setMaskFilter(null);

        float tipX = cx + (float) Math.cos(angle) * planeRx * 0.96f;
        float tipY = cy + (float) Math.sin(angle) * planeRy * 0.96f;
        linePaint.setStyle(Paint.Style.STROKE);
        linePaint.setStrokeWidth(dp(2.2f));
        linePaint.setColor(withAlpha(COLOR_WHITE, lineAlpha));
        linePaint.setMaskFilter(new BlurMaskFilter(dp(4f), BlurMaskFilter.Blur.NORMAL));
        canvas.drawLine(cx, cy, tipX, tipY, linePaint);
        linePaint.setMaskFilter(null);
    }

    private void drawParticles(Canvas canvas, float cx, float cy, float planeRx, float planeRy, float t) {
        int visibleCount = Math.min(PARTICLE_COUNT, 76 + Math.round(signalLevel * 20f));
        for (int i = 0; i < visibleCount; i++) {
            Particle p = particles[i];
            float a = p.orbit + t * p.speed;
            float baseX = cx + (float) Math.cos(a) * planeRx * p.radius * 0.88f;
            float baseY = cy + (float) Math.sin(a) * planeRy * p.radius * 0.88f;

            float z = p.height + (float) Math.sin(t * 1.4f + p.phase) * 0.18f;
            float x = baseX + (float) Math.sin(t * 1.2f + p.phase) * dp(1.8f);
            float y = baseY - z * dp(36f);
            float radius = dp(p.size * (0.65f + (z + 0.6f)));

            float threat = p.danger > 0.72f ? 0.42f : 0f;
            threat = Math.min(1f, threat + dangerLevel * 0.45f * (p.danger > 0.86f ? 1f : 0.35f));
            int color = lerpColor(COLOR_RADAR_CYAN, COLOR_RADAR_RED, threat);
            if (p.danger > 0.9f) {
                color = lerpColor(color, COLOR_RADAR_HOT, 0.45f);
            }

            int alpha = clamp255((int) (86 + (z + 0.6f) * 110));
            particlePaint.setStyle(Paint.Style.FILL);
            particlePaint.setColor(withAlpha(color, alpha));
            particlePaint.setMaskFilter(new BlurMaskFilter(Math.max(dp(1.6f), radius * 0.7f), BlurMaskFilter.Blur.NORMAL));
            canvas.drawCircle(x, y, radius, particlePaint);
            particlePaint.setMaskFilter(null);

            particlePaint.setColor(withAlpha(color, Math.min(255, alpha + 40)));
            canvas.drawCircle(x, y, radius * 0.54f, particlePaint);
        }
    }

    private void drawCore(Canvas canvas, float cx, float cy, float shellR, float t) {
        float pulse = pulseEnabled ? 0.5f + 0.5f * (float) Math.sin(t * 2.7f) : 0.35f;
        float coreR = dp(13f + pulse * 5f);

        float glowR = coreR * 2.1f;
        glowPaint.setShader(new RadialGradient(cx, cy, glowR,
            new int[]{withAlpha(Color.rgb(92, 226, 236), (int) (32 + pulse * 36)), withAlpha(Color.rgb(92, 226, 236), 0)},
            new float[]{0f, 1f},
            Shader.TileMode.CLAMP));
        glowPaint.setStyle(Paint.Style.FILL);
        canvas.drawCircle(cx, cy, glowR, glowPaint);
        glowPaint.setShader(null);

        fillPaint.setShader(new RadialGradient(cx, cy, coreR,
            new int[]{withAlpha(Color.rgb(248, 252, 255), 250), withAlpha(Color.rgb(178, 248, 244), 210), withAlpha(Color.rgb(178, 248, 244), 0)},
            new float[]{0f, 0.45f, 1f},
            Shader.TileMode.CLAMP));
        canvas.drawCircle(cx, cy, coreR, fillPaint);
        fillPaint.setShader(null);

        strokePaint.setStyle(Paint.Style.STROKE);
        strokePaint.setStrokeWidth(dp(1.4f));
        strokePaint.setColor(withAlpha(COLOR_RADAR_CYAN, (int) (70 + pulse * 60f)));
        canvas.drawOval(new RectF(cx - coreR * 3.0f, cy - coreR * 1.1f, cx + coreR * 3.0f, cy + coreR * 1.1f), strokePaint);
    }

    public void setRotationSpeed(float speed) {
        rotationSpeed = speed;
    }

    public void setPulseEnabled(boolean enabled) {
        pulseEnabled = enabled;
    }

    public void setSignalLevel(float level) {
        signalLevel = clamp01(level);
    }

    public void setDangerLevel(float level) {
        dangerLevel = clamp01(level);
    }

    public void setThemeVariant(String variant) {
        themeVariant = variant != null ? variant : "contour_orbit";
    }

    public String getThemeVariant() {
        return themeVariant;
    }

    public void setPaused(boolean paused) {
        this.paused = paused;
        if (!paused) {
            postInvalidateOnAnimation();
        }
    }

    public void restartSimulation() {
        startTimeMs = SystemClock.uptimeMillis();
        initParticles();
        invalidate();
    }

    private float dp(float value) {
        return value * getResources().getDisplayMetrics().density;
    }

    private static int withAlpha(int color, int alpha) {
        return Color.argb(clamp255(alpha), Color.red(color), Color.green(color), Color.blue(color));
    }

    private static float clamp01(float value) {
        return Math.max(0f, Math.min(1f, value));
    }

    private static int clamp255(int value) {
        return Math.max(0, Math.min(255, value));
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
        final float height;
        final float size;

        Particle(float orbit, float radius, float speed, float phase, float danger, float height, float size) {
            this.orbit = orbit;
            this.radius = radius;
            this.speed = speed;
            this.phase = phase;
            this.danger = danger;
            this.height = height;
            this.size = size;
        }
    }
}
