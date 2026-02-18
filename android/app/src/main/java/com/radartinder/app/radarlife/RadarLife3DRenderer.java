package com.radartinder.app.radarlife;

import android.opengl.GLES20;
import android.opengl.GLSurfaceView;
import android.opengl.Matrix;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;

import javax.microedition.khronos.egl.EGLConfig;
import javax.microedition.khronos.opengles.GL10;

/**
 * OpenGL ES 2.0 renderer for the Radar Life 3D Conway visualization.
 *
 * Geometry layers (back to front):
 *   1. Circular disk base
 *   2. 3 concentric ring contours
 *   3. 3 orbit ribbon layers
 *   4. Life cells (billboarded quads with energy-based Y offset)
 *   5. Sweep beam (rotating 45° arc)
 */
public class RadarLife3DRenderer implements GLSurfaceView.Renderer {

    // ── Conway grid ──
    private final LifeGrid grid;
    private final float[] energyBuf  = new float[LifeGrid.SIZE * LifeGrid.SIZE];
    private final boolean[] aliveBuf = new boolean[LifeGrid.SIZE * LifeGrid.SIZE];

    // ── Tick timing (8 Hz) ──
    private static final long TICK_INTERVAL_NS = 125_000_000L; // 125 ms
    private long lastTickNs = 0;

    // ── Props (set from UI thread) ──
    private volatile float rotationSpeed = 1.0f;
    private volatile boolean pulseEnabled = true;
    private volatile float dangerLevel = 0f;

    // ── Colors: lerp(normal, danger, dangerLevel) ──
    private static final float[] COLOR_NORMAL_PRIMARY   = { 0.306f, 0.804f, 0.769f, 1f }; // #4ECDC4
    private static final float[] COLOR_NORMAL_SECONDARY = { 0.220f, 0.741f, 0.973f, 1f }; // #38BDF8
    private static final float[] COLOR_DANGER_PRIMARY   = { 1.000f, 0.322f, 0.322f, 1f }; // #FF5252
    private static final float[] COLOR_DANGER_SECONDARY = { 1.000f, 0.420f, 0.231f, 1f }; // #FF6B3B

    // ── Matrices ──
    private final float[] projMatrix  = new float[16];
    private final float[] viewMatrix  = new float[16];
    private final float[] vpMatrix    = new float[16];
    private final float[] mvpMatrix   = new float[16];
    private final float[] modelMatrix = new float[16];

    // ── Camera ──
    private static final float CAMERA_TILT_DEG = 21f;
    private static final float CAMERA_DISTANCE = 3.2f;
    private static final float FOV_DEG = 45f;

    // ── Geometry handles ──
    private int shaderProgram;
    private int uMVPMatrixHandle;
    private int uColorHandle;
    private int aPositionHandle;

    // Disk
    private static final int DISK_SEGMENTS = 64;
    private FloatBuffer diskVertexBuf;
    private int diskVertexCount;

    // Rings
    private static final int RING_SEGMENTS = 64;
    private static final float[] RING_RADII = { 0.35f, 0.65f, 0.95f };
    private FloatBuffer[] ringVertexBufs;

    // Sweep beam
    private static final int SWEEP_SEGMENTS = 16;
    private static final float SWEEP_ARC_DEG = 45f;
    private FloatBuffer sweepVertexBuf;
    private int sweepVertexCount;
    private float sweepAngleDeg = 0f;

    // Orbit ribbons
    private static final int ORBIT_SEGMENTS = 80;
    private static final float[] ORBIT_RADII = { 0.45f, 0.70f, 0.90f };
    private static final float ORBIT_RIBBON_WIDTH = 0.015f;
    private FloatBuffer[] orbitVertexBufs;
    private int orbitVertexCount;
    private float orbitPhase = 0f;

    // Life cells
    private static final float CELL_QUAD_SIZE = 0.018f;
    private FloatBuffer cellVertexBuf;

    // ── Shaders ──
    private static final String VERTEX_SHADER =
        "uniform mat4 uMVPMatrix;\n" +
        "attribute vec4 aPosition;\n" +
        "void main() {\n" +
        "  gl_Position = uMVPMatrix * aPosition;\n" +
        "}\n";

    private static final String FRAGMENT_SHADER =
        "precision mediump float;\n" +
        "uniform vec4 uColor;\n" +
        "void main() {\n" +
        "  gl_FragColor = uColor;\n" +
        "}\n";

    public RadarLife3DRenderer(LifeGrid grid) {
        this.grid = grid;
    }

    // ═══════════════════════════════════════════
    //  GLSurfaceView.Renderer
    // ═══════════════════════════════════════════

    @Override
    public void onSurfaceCreated(GL10 unused, EGLConfig config) {
        GLES20.glClearColor(0f, 0f, 0f, 0f);
        GLES20.glEnable(GLES20.GL_BLEND);
        GLES20.glBlendFunc(GLES20.GL_SRC_ALPHA, GLES20.GL_ONE_MINUS_SRC_ALPHA);

        shaderProgram = createProgram(VERTEX_SHADER, FRAGMENT_SHADER);
        aPositionHandle = GLES20.glGetAttribLocation(shaderProgram, "aPosition");
        uMVPMatrixHandle = GLES20.glGetUniformLocation(shaderProgram, "uMVPMatrix");
        uColorHandle = GLES20.glGetUniformLocation(shaderProgram, "uColor");

        buildDiskGeometry();
        buildRingGeometry();
        buildSweepGeometry();
        buildOrbitGeometry();
        buildCellQuadTemplate();

        lastTickNs = System.nanoTime();
    }

    @Override
    public void onSurfaceChanged(GL10 unused, int width, int height) {
        GLES20.glViewport(0, 0, width, height);
        float aspect = (float) width / Math.max(1, height);
        Matrix.perspectiveM(projMatrix, 0, FOV_DEG, aspect, 0.1f, 100f);

        float tiltRad = (float) Math.toRadians(CAMERA_TILT_DEG);
        float eyeY = (float) (CAMERA_DISTANCE * Math.sin(tiltRad));
        float eyeZ = (float) (CAMERA_DISTANCE * Math.cos(tiltRad));
        Matrix.setLookAtM(viewMatrix, 0,
                0f, eyeY, eyeZ,   // eye
                0f, 0f, 0f,       // center
                0f, 1f, 0f);      // up

        Matrix.multiplyMM(vpMatrix, 0, projMatrix, 0, viewMatrix, 0);
    }

    @Override
    public void onDrawFrame(GL10 unused) {
        // ── Tick Conway at 8 Hz ──
        long now = System.nanoTime();
        if (now - lastTickNs >= TICK_INTERVAL_NS) {
            grid.tick();
            lastTickNs = now;
        }
        grid.copyEnergyTo(energyBuf);
        grid.copyAliveTo(aliveBuf);

        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT | GLES20.GL_DEPTH_BUFFER_BIT);
        GLES20.glUseProgram(shaderProgram);

        float dl = dangerLevel;
        float[] primary   = lerpColor(COLOR_NORMAL_PRIMARY,   COLOR_DANGER_PRIMARY,   dl);
        float[] secondary = lerpColor(COLOR_NORMAL_SECONDARY, COLOR_DANGER_SECONDARY, dl);

        float dt = 1f / 60f; // approximate
        float speed = rotationSpeed;

        // 1. Disk
        drawDisk(primary);

        // 2. Rings
        drawRings(secondary);

        // 3. Orbit ribbons
        orbitPhase += dt * speed * 20f;
        drawOrbits(secondary, orbitPhase);

        // 4. Life cells
        drawCells(primary, secondary);

        // 5. Sweep beam
        sweepAngleDeg += dt * speed * 90f;
        if (sweepAngleDeg >= 360f) sweepAngleDeg -= 360f;
        drawSweep(primary, sweepAngleDeg);
    }

    // ═══════════════════════════════════════════
    //  Geometry builders
    // ═══════════════════════════════════════════

    private void buildDiskGeometry() {
        // Triangle fan: center + edge vertices
        diskVertexCount = DISK_SEGMENTS + 2;
        float[] verts = new float[diskVertexCount * 3];
        // center
        verts[0] = 0f; verts[1] = 0f; verts[2] = 0f;
        for (int i = 0; i <= DISK_SEGMENTS; i++) {
            float angle = (float) (2.0 * Math.PI * i / DISK_SEGMENTS);
            int idx = (i + 1) * 3;
            verts[idx]     = (float) Math.cos(angle);
            verts[idx + 1] = 0f;
            verts[idx + 2] = (float) Math.sin(angle);
        }
        diskVertexBuf = makeFloatBuffer(verts);
    }

    private void buildRingGeometry() {
        ringVertexBufs = new FloatBuffer[RING_RADII.length];
        for (int r = 0; r < RING_RADII.length; r++) {
            float radius = RING_RADII[r];
            float[] verts = new float[(RING_SEGMENTS + 1) * 3];
            for (int i = 0; i <= RING_SEGMENTS; i++) {
                float angle = (float) (2.0 * Math.PI * i / RING_SEGMENTS);
                int idx = i * 3;
                verts[idx]     = radius * (float) Math.cos(angle);
                verts[idx + 1] = 0.001f; // tiny Y offset to avoid z-fight
                verts[idx + 2] = radius * (float) Math.sin(angle);
            }
            ringVertexBufs[r] = makeFloatBuffer(verts);
        }
    }

    private void buildSweepGeometry() {
        // Triangle fan from center: 1 center + SWEEP_SEGMENTS+1 edge points
        sweepVertexCount = SWEEP_SEGMENTS + 2;
        float[] verts = new float[sweepVertexCount * 3];
        verts[0] = 0f; verts[1] = 0.002f; verts[2] = 0f;
        float arcRad = (float) Math.toRadians(SWEEP_ARC_DEG);
        float startAngle = -arcRad / 2f;
        for (int i = 0; i <= SWEEP_SEGMENTS; i++) {
            float a = startAngle + arcRad * i / SWEEP_SEGMENTS;
            int idx = (i + 1) * 3;
            verts[idx]     = (float) Math.cos(a);
            verts[idx + 1] = 0.002f;
            verts[idx + 2] = (float) Math.sin(a);
        }
        sweepVertexBuf = makeFloatBuffer(verts);
    }

    private void buildOrbitGeometry() {
        orbitVertexBufs = new FloatBuffer[ORBIT_RADII.length];
        orbitVertexCount = (ORBIT_SEGMENTS + 1) * 2; // triangle strip
        for (int o = 0; o < ORBIT_RADII.length; o++) {
            float[] verts = new float[orbitVertexCount * 3];
            float radius = ORBIT_RADII[o];
            for (int i = 0; i <= ORBIT_SEGMENTS; i++) {
                float angle = (float) (2.0 * Math.PI * i / ORBIT_SEGMENTS);
                float cos = (float) Math.cos(angle);
                float sin = (float) Math.sin(angle);
                int idx = i * 6;
                // inner edge
                verts[idx]     = (radius - ORBIT_RIBBON_WIDTH) * cos;
                verts[idx + 1] = 0.003f;
                verts[idx + 2] = (radius - ORBIT_RIBBON_WIDTH) * sin;
                // outer edge
                verts[idx + 3] = (radius + ORBIT_RIBBON_WIDTH) * cos;
                verts[idx + 4] = 0.003f;
                verts[idx + 5] = (radius + ORBIT_RIBBON_WIDTH) * sin;
            }
            orbitVertexBufs[o] = makeFloatBuffer(verts);
        }
    }

    private void buildCellQuadTemplate() {
        // Single unit quad centered at origin, on XZ plane (will be translated per cell)
        float h = CELL_QUAD_SIZE / 2f;
        float[] verts = {
            -h, 0f, -h,
             h, 0f, -h,
            -h, 0f,  h,
             h, 0f,  h,
        };
        cellVertexBuf = makeFloatBuffer(verts);
    }

    // ═══════════════════════════════════════════
    //  Draw calls
    // ═══════════════════════════════════════════

    private void drawDisk(float[] baseColor) {
        Matrix.setIdentityM(modelMatrix, 0);
        Matrix.multiplyMM(mvpMatrix, 0, vpMatrix, 0, modelMatrix, 0);

        float pulse = pulseEnabled ? 0.08f + 0.02f * (float) Math.sin(System.nanoTime() / 500_000_000.0) : 0.08f;
        float[] color = { baseColor[0] * 0.3f, baseColor[1] * 0.3f, baseColor[2] * 0.3f, pulse };

        GLES20.glUniformMatrix4fv(uMVPMatrixHandle, 1, false, mvpMatrix, 0);
        GLES20.glUniform4fv(uColorHandle, 1, color, 0);

        GLES20.glEnableVertexAttribArray(aPositionHandle);
        GLES20.glVertexAttribPointer(aPositionHandle, 3, GLES20.GL_FLOAT, false, 0, diskVertexBuf);
        GLES20.glDrawArrays(GLES20.GL_TRIANGLE_FAN, 0, diskVertexCount);
        GLES20.glDisableVertexAttribArray(aPositionHandle);
    }

    private void drawRings(float[] color) {
        Matrix.setIdentityM(modelMatrix, 0);
        Matrix.multiplyMM(mvpMatrix, 0, vpMatrix, 0, modelMatrix, 0);
        GLES20.glUniformMatrix4fv(uMVPMatrixHandle, 1, false, mvpMatrix, 0);

        GLES20.glLineWidth(1.5f);

        for (int r = 0; r < ringVertexBufs.length; r++) {
            float alpha = 0.15f + 0.05f * r;
            float[] c = { color[0], color[1], color[2], alpha };
            GLES20.glUniform4fv(uColorHandle, 1, c, 0);

            GLES20.glEnableVertexAttribArray(aPositionHandle);
            GLES20.glVertexAttribPointer(aPositionHandle, 3, GLES20.GL_FLOAT, false, 0, ringVertexBufs[r]);
            GLES20.glDrawArrays(GLES20.GL_LINE_STRIP, 0, RING_SEGMENTS + 1);
            GLES20.glDisableVertexAttribArray(aPositionHandle);
        }
    }

    private void drawOrbits(float[] color, float phase) {
        for (int o = 0; o < orbitVertexBufs.length; o++) {
            float radius = ORBIT_RADII[o];
            // Rebuild with sin distortion based on phase
            float[] verts = new float[orbitVertexCount * 3];
            float phaseOffset = phase + o * 2.094f; // 120° apart
            for (int i = 0; i <= ORBIT_SEGMENTS; i++) {
                float angle = (float) (2.0 * Math.PI * i / ORBIT_SEGMENTS);
                float cos = (float) Math.cos(angle);
                float sin = (float) Math.sin(angle);
                float distortion = 0.01f * (float) Math.sin(angle * 3.0 + phaseOffset);
                float yOff = 0.003f + distortion;
                int idx = i * 6;
                verts[idx]     = (radius - ORBIT_RIBBON_WIDTH) * cos;
                verts[idx + 1] = yOff;
                verts[idx + 2] = (radius - ORBIT_RIBBON_WIDTH) * sin;
                verts[idx + 3] = (radius + ORBIT_RIBBON_WIDTH) * cos;
                verts[idx + 4] = yOff;
                verts[idx + 5] = (radius + ORBIT_RIBBON_WIDTH) * sin;
            }
            FloatBuffer buf = makeFloatBuffer(verts);

            Matrix.setIdentityM(modelMatrix, 0);
            Matrix.multiplyMM(mvpMatrix, 0, vpMatrix, 0, modelMatrix, 0);
            GLES20.glUniformMatrix4fv(uMVPMatrixHandle, 1, false, mvpMatrix, 0);

            float alpha = 0.12f + 0.04f * o;
            float[] c = { color[0], color[1], color[2], alpha };
            GLES20.glUniform4fv(uColorHandle, 1, c, 0);

            GLES20.glEnableVertexAttribArray(aPositionHandle);
            GLES20.glVertexAttribPointer(aPositionHandle, 3, GLES20.GL_FLOAT, false, 0, buf);
            GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, orbitVertexCount);
            GLES20.glDisableVertexAttribArray(aPositionHandle);
        }
    }

    private void drawCells(float[] primary, float[] secondary) {
        int S = LifeGrid.SIZE;
        float gridWorldSize = 1.8f; // maps 36-cell grid to -0.9..+0.9 world units
        float cellStep = gridWorldSize / S;

        for (int y = 0; y < S; y++) {
            for (int x = 0; x < S; x++) {
                int idx = y * S + x;
                float e = energyBuf[idx];
                if (e < 0.02f) continue; // invisible — skip

                float wx = (x - S / 2f + 0.5f) * cellStep;
                float wz = (y - S / 2f + 0.5f) * cellStep;
                float wy = e * 0.15f; // pseudo-3D height

                // Distance from center for radial fade
                float dist = (float) Math.sqrt(wx * wx + wz * wz);
                if (dist > 1.0f) continue; // clip to disk radius

                Matrix.setIdentityM(modelMatrix, 0);
                Matrix.translateM(modelMatrix, 0, wx, wy, wz);
                Matrix.multiplyMM(mvpMatrix, 0, vpMatrix, 0, modelMatrix, 0);
                GLES20.glUniformMatrix4fv(uMVPMatrixHandle, 1, false, mvpMatrix, 0);

                // Color: blend primary/secondary by energy, alpha = energy
                float blend = e;
                float[] c = {
                    primary[0] * (1 - blend) + secondary[0] * blend,
                    primary[1] * (1 - blend) + secondary[1] * blend,
                    primary[2] * (1 - blend) + secondary[2] * blend,
                    Math.min(1f, e * 1.5f) * (1f - dist * 0.5f)
                };
                GLES20.glUniform4fv(uColorHandle, 1, c, 0);

                GLES20.glEnableVertexAttribArray(aPositionHandle);
                GLES20.glVertexAttribPointer(aPositionHandle, 3, GLES20.GL_FLOAT, false, 0, cellVertexBuf);
                GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4);
                GLES20.glDisableVertexAttribArray(aPositionHandle);
            }
        }
    }

    private void drawSweep(float[] color, float angleDeg) {
        Matrix.setIdentityM(modelMatrix, 0);
        Matrix.rotateM(modelMatrix, 0, angleDeg, 0f, 1f, 0f);
        Matrix.multiplyMM(mvpMatrix, 0, vpMatrix, 0, modelMatrix, 0);
        GLES20.glUniformMatrix4fv(uMVPMatrixHandle, 1, false, mvpMatrix, 0);

        float[] c = { color[0], color[1], color[2], 0.18f };
        GLES20.glUniform4fv(uColorHandle, 1, c, 0);

        GLES20.glEnableVertexAttribArray(aPositionHandle);
        GLES20.glVertexAttribPointer(aPositionHandle, 3, GLES20.GL_FLOAT, false, 0, sweepVertexBuf);
        GLES20.glDrawArrays(GLES20.GL_TRIANGLE_FAN, 0, sweepVertexCount);
        GLES20.glDisableVertexAttribArray(aPositionHandle);
    }

    // ═══════════════════════════════════════════
    //  Prop setters (UI thread)
    // ═══════════════════════════════════════════

    public void setRotationSpeed(float speed) {
        this.rotationSpeed = speed;
    }

    public void setPulseEnabled(boolean enabled) {
        this.pulseEnabled = enabled;
    }

    public void setDangerLevel(float level) {
        this.dangerLevel = Math.max(0, Math.min(1, level));
    }

    // ═══════════════════════════════════════════
    //  Utility
    // ═══════════════════════════════════════════

    private static float[] lerpColor(float[] a, float[] b, float t) {
        return new float[] {
            a[0] + (b[0] - a[0]) * t,
            a[1] + (b[1] - a[1]) * t,
            a[2] + (b[2] - a[2]) * t,
            a[3] + (b[3] - a[3]) * t,
        };
    }

    private static FloatBuffer makeFloatBuffer(float[] data) {
        ByteBuffer bb = ByteBuffer.allocateDirect(data.length * 4);
        bb.order(ByteOrder.nativeOrder());
        FloatBuffer fb = bb.asFloatBuffer();
        fb.put(data);
        fb.position(0);
        return fb;
    }

    private static int createProgram(String vertexSrc, String fragmentSrc) {
        int vs = loadShader(GLES20.GL_VERTEX_SHADER, vertexSrc);
        int fs = loadShader(GLES20.GL_FRAGMENT_SHADER, fragmentSrc);
        int prog = GLES20.glCreateProgram();
        GLES20.glAttachShader(prog, vs);
        GLES20.glAttachShader(prog, fs);
        GLES20.glLinkProgram(prog);
        return prog;
    }

    private static int loadShader(int type, String source) {
        int shader = GLES20.glCreateShader(type);
        GLES20.glShaderSource(shader, source);
        GLES20.glCompileShader(shader);
        return shader;
    }
}
