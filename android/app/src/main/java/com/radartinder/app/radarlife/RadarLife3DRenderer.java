package com.radartinder.app.radarlife;

import android.opengl.GLES20;
import android.opengl.GLSurfaceView;
import android.opengl.Matrix;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;
import java.util.Random;

import javax.microedition.khronos.egl.EGLConfig;
import javax.microedition.khronos.opengles.GL10;

public class RadarLife3DRenderer implements GLSurfaceView.Renderer {

    private static final long TICK_INTERVAL_NS = 125_000_000L;

    private static final float[] COLOR_NORMAL_PRIMARY = { 0.306f, 0.804f, 0.769f, 1f };
    private static final float[] COLOR_NORMAL_SECONDARY = { 0.220f, 0.741f, 0.973f, 1f };
    private static final float[] COLOR_DANGER_PRIMARY = { 1.000f, 0.322f, 0.322f, 1f };
    private static final float[] COLOR_DANGER_SECONDARY = { 1.000f, 0.420f, 0.231f, 1f };
    private static final float[] COLOR_WORLD_GLOW = { 0.090f, 0.310f, 0.560f, 1f };

    private static final float CAMERA_TILT_DEG = 14f;
    private static final float CAMERA_DISTANCE = 3.45f;
    private static final float FOV_DEG = 36f;

    private static final int DISK_SEGMENTS = 72;
    private static final int RING_SEGMENTS = 72;
    private static final int SWEEP_SEGMENTS = 24;
    private static final int ORBIT_SEGMENTS = 120;

    private static final float SCENE_SPHERE_RADIUS = 1.34f;
    private static final float RADAR_PLANE_Y = 0.02f;
    private static final float RADAR_RADIUS = 1.08f;
    private static final float CELL_QUAD_SIZE = 0.022f;
    private static final float PARTICLE_QUAD_SIZE = 0.017f;
    private static final float ORBIT_RIBBON_WIDTH = 0.008f;
    private static final float[] RING_RADII = { 0.12f, 0.24f, 0.36f, 0.48f, 0.60f, 0.72f, 0.84f };
    private static final float[] ORBIT_RADII = { 0.34f, 0.48f, 0.62f, 0.76f };

    private static final int QUANTUM_PARTICLE_COUNT = 96;

    private final LifeGrid grid;
    private final float[] energyBuf = new float[LifeGrid.SIZE * LifeGrid.SIZE];
    private final boolean[] aliveBuf = new boolean[LifeGrid.SIZE * LifeGrid.SIZE];

    private final float[] projMatrix = new float[16];
    private final float[] viewMatrix = new float[16];
    private final float[] vpMatrix = new float[16];
    private final float[] mvpMatrix = new float[16];
    private final float[] modelMatrix = new float[16];

    private final Random rng = new Random();
    private final float[] particleAngle = new float[QUANTUM_PARTICLE_COUNT];
    private final float[] particleRadius = new float[QUANTUM_PARTICLE_COUNT];
    private final float[] particleHeight = new float[QUANTUM_PARTICLE_COUNT];
    private final float[] particleSpeed = new float[QUANTUM_PARTICLE_COUNT];
    private final float[] particlePhase = new float[QUANTUM_PARTICLE_COUNT];
    private final float[] particleTilt = new float[QUANTUM_PARTICLE_COUNT];
    private final float[] particleThreatSeed = new float[QUANTUM_PARTICLE_COUNT];

    private volatile float rotationSpeed = 1.0f;
    private volatile boolean pulseEnabled = true;
    private volatile float dangerLevel = 0f;
    private volatile float signalLevel = 0f;

    private long lastTickNs = 0L;
    private float sweepAngleDeg = 0f;
    private float orbitPhase = 0f;
    private float worldPhase = 0f;

    private int shaderProgram;
    private int uMVPMatrixHandle;
    private int uColorHandle;
    private int aPositionHandle;

    private FloatBuffer diskVertexBuf;
    private int diskVertexCount;
    private FloatBuffer unitRingVertexBuf;
    private int unitRingVertexCount;
    private FloatBuffer sweepVertexBuf;
    private int sweepVertexCount;
    private FloatBuffer[] orbitVertexBufs;
    private int orbitVertexCount;
    private FloatBuffer quadVertexBuf;

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
        initQuantumParticles();
    }

    @Override
    public void onSurfaceCreated(GL10 unused, EGLConfig config) {
        GLES20.glClearColor(0f, 0f, 0f, 0f);
        GLES20.glEnable(GLES20.GL_BLEND);
        GLES20.glBlendFunc(GLES20.GL_SRC_ALPHA, GLES20.GL_ONE_MINUS_SRC_ALPHA);
        GLES20.glEnable(GLES20.GL_DEPTH_TEST);
        GLES20.glDepthFunc(GLES20.GL_LEQUAL);

        shaderProgram = createProgram(VERTEX_SHADER, FRAGMENT_SHADER);
        aPositionHandle = GLES20.glGetAttribLocation(shaderProgram, "aPosition");
        uMVPMatrixHandle = GLES20.glGetUniformLocation(shaderProgram, "uMVPMatrix");
        uColorHandle = GLES20.glGetUniformLocation(shaderProgram, "uColor");

        buildDiskGeometry();
        buildRingGeometry();
        buildSweepGeometry();
        buildOrbitGeometry();
        buildQuadGeometry();

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
        Matrix.setLookAtM(viewMatrix, 0, 0f, eyeY, eyeZ, 0f, RADAR_PLANE_Y, 0f, 0f, 1f, 0f);

        Matrix.multiplyMM(vpMatrix, 0, projMatrix, 0, viewMatrix, 0);
    }

    @Override
    public void onDrawFrame(GL10 unused) {
        long now = System.nanoTime();
        if (now - lastTickNs >= TICK_INTERVAL_NS) {
            grid.tick();
            lastTickNs = now;
        }

        grid.copyEnergyTo(energyBuf);
        grid.copyAliveTo(aliveBuf);

        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT | GLES20.GL_DEPTH_BUFFER_BIT);
        GLES20.glUseProgram(shaderProgram);

        float[] primary = lerpColor(COLOR_NORMAL_PRIMARY, COLOR_DANGER_PRIMARY, dangerLevel);
        float[] secondary = lerpColor(COLOR_NORMAL_SECONDARY, COLOR_DANGER_SECONDARY, dangerLevel);
        float[] shellGlow = lerpColor(COLOR_WORLD_GLOW, COLOR_DANGER_PRIMARY, dangerLevel * 0.35f);

        float dt = 1f / 60f;
        float speed = Math.max(0.15f, rotationSpeed);
        worldPhase += dt * speed;
        orbitPhase += dt * speed * 1.4f;
        sweepAngleDeg += dt * (58f + signalLevel * 46f) * speed;
        if (sweepAngleDeg >= 360f) sweepAngleDeg -= 360f;

        drawSphereShell(shellGlow, secondary);
        drawWorldAura(shellGlow);
        drawQuantumField(primary, secondary);
        drawRadarDisk(primary);
        drawRings(secondary);
        drawOrbits(primary, secondary);
        drawCells(primary, secondary);
        drawSweep(primary, secondary);
        drawCorePulse(primary, secondary);
    }

    private void initQuantumParticles() {
        for (int i = 0; i < QUANTUM_PARTICLE_COUNT; i++) {
            particleAngle[i] = rng.nextFloat() * 360f;
            particleRadius[i] = 0.10f + rng.nextFloat() * 0.86f;
            particleHeight[i] = -0.24f + rng.nextFloat() * 0.74f;
            particleSpeed[i] = 10f + rng.nextFloat() * 16f;
            particlePhase[i] = rng.nextFloat() * 6.28318f;
            particleTilt[i] = -10f + rng.nextFloat() * 20f;
            particleThreatSeed[i] = rng.nextFloat();
        }
    }

    private void buildDiskGeometry() {
        diskVertexCount = DISK_SEGMENTS + 2;
        float[] verts = new float[diskVertexCount * 3];
        verts[0] = 0f; verts[1] = 0f; verts[2] = 0f;
        for (int i = 0; i <= DISK_SEGMENTS; i++) {
            float angle = (float) (2.0 * Math.PI * i / DISK_SEGMENTS);
            int idx = (i + 1) * 3;
            verts[idx] = (float) Math.cos(angle);
            verts[idx + 1] = 0f;
            verts[idx + 2] = (float) Math.sin(angle);
        }
        diskVertexBuf = makeFloatBuffer(verts);
    }

    private void buildRingGeometry() {
        unitRingVertexCount = RING_SEGMENTS + 1;
        float[] verts = new float[unitRingVertexCount * 3];
        for (int i = 0; i <= RING_SEGMENTS; i++) {
            float angle = (float) (2.0 * Math.PI * i / RING_SEGMENTS);
            int idx = i * 3;
            verts[idx] = (float) Math.cos(angle);
            verts[idx + 1] = 0f;
            verts[idx + 2] = (float) Math.sin(angle);
        }
        unitRingVertexBuf = makeFloatBuffer(verts);
    }

    private void buildSweepGeometry() {
        sweepVertexCount = SWEEP_SEGMENTS + 2;
        float[] verts = new float[sweepVertexCount * 3];
        verts[0] = 0f; verts[1] = 0f; verts[2] = 0f;
        float baseArc = (float) Math.toRadians(54f);
        for (int i = 0; i <= SWEEP_SEGMENTS; i++) {
            float a = -baseArc / 2f + baseArc * i / SWEEP_SEGMENTS;
            int idx = (i + 1) * 3;
            verts[idx] = (float) Math.cos(a);
            verts[idx + 1] = 0f;
            verts[idx + 2] = (float) Math.sin(a);
        }
        sweepVertexBuf = makeFloatBuffer(verts);
    }

    private void buildOrbitGeometry() {
        orbitVertexBufs = new FloatBuffer[ORBIT_RADII.length];
        for (int o = 0; o < ORBIT_RADII.length; o++) {
            float radius = ORBIT_RADII[o];
            float[] verts = new float[(ORBIT_SEGMENTS + 1) * 6];
            for (int i = 0; i <= ORBIT_SEGMENTS; i++) {
                float angle = (float) (2.0 * Math.PI * i / ORBIT_SEGMENTS);
                float cos = (float) Math.cos(angle);
                float sin = (float) Math.sin(angle);
                int idx = i * 6;
                verts[idx] = (radius - ORBIT_RIBBON_WIDTH) * cos;
                verts[idx + 1] = 0f;
                verts[idx + 2] = (radius - ORBIT_RIBBON_WIDTH) * sin;
                verts[idx + 3] = (radius + ORBIT_RIBBON_WIDTH) * cos;
                verts[idx + 4] = 0f;
                verts[idx + 5] = (radius + ORBIT_RIBBON_WIDTH) * sin;
            }
            orbitVertexBufs[o] = makeFloatBuffer(verts);
        }
        orbitVertexCount = (ORBIT_SEGMENTS + 1) * 2;
    }

    private void buildQuadGeometry() {
        float h = 0.5f;
        float[] verts = {-h, 0f, -h, h, 0f, -h, -h, 0f, h, h, 0f, h};
        quadVertexBuf = makeFloatBuffer(verts);
    }

    private void drawSphereShell(float[] shellGlow, float[] secondary) {
        float scale = SCENE_SPHERE_RADIUS;
        drawDiskScaled(0f, 0f, 0f, scale, scale, scale, new float[] { shellGlow[0], shellGlow[1], shellGlow[2], 0.085f + signalLevel * 0.04f });
        float[] latitudes = { -0.68f, -0.42f, -0.18f, 0.12f, 0.38f, 0.62f };
        for (int i = 0; i < latitudes.length; i++) {
            float y = latitudes[i] * SCENE_SPHERE_RADIUS;
            float rs = SCENE_SPHERE_RADIUS * (1.0f - Math.abs(latitudes[i]) * 0.52f);
            float alpha = 0.10f + i * 0.02f;
            drawRingScaled(0f, y, 0f, rs, rs * 0.85f, new float[] { shellGlow[0], shellGlow[1], shellGlow[2], alpha });
        }
        for (int i = 0; i < 4; i++) {
            Matrix.setIdentityM(modelMatrix, 0);
            Matrix.rotateM(modelMatrix, 0, i * 45f + worldPhase * 9f, 0f, 1f, 0f);
            Matrix.rotateM(modelMatrix, 0, 90f, 0f, 0f, 1f);
            Matrix.scaleM(modelMatrix, 0, scale * (0.72f + i * 0.07f), scale * 0.96f, scale);
            drawLineStrip(modelMatrix, new float[] { secondary[0], secondary[1], secondary[2], 0.08f + i * 0.02f });
        }
    }

    private void drawWorldAura(float[] shellGlow) {
        float breathe = pulseEnabled ? 0.10f + 0.03f * (float) Math.sin(worldPhase * 2.3f) : 0.08f;
        drawDiskScaled(0f, 0f, 0f, SCENE_SPHERE_RADIUS * 1.02f, SCENE_SPHERE_RADIUS * 1.02f, SCENE_SPHERE_RADIUS * 1.02f,
            new float[] { shellGlow[0], shellGlow[1], shellGlow[2], breathe });
    }

    private void drawRadarDisk(float[] primary) {
        float pulse = pulseEnabled ? 0.18f + 0.05f * (float) Math.sin(worldPhase * 3.1f) : 0.14f;
        drawDiskScaled(0f, RADAR_PLANE_Y, 0f, RADAR_RADIUS, 0.85f, RADAR_RADIUS * 0.85f, new float[] { 0.03f, 0.10f, 0.20f, 0.72f });
        drawDiskScaled(0f, RADAR_PLANE_Y, 0f, RADAR_RADIUS * 0.88f, 0.85f, RADAR_RADIUS * 0.85f * 0.88f, new float[] { primary[0] * 0.18f, primary[1] * 0.18f, primary[2] * 0.18f, pulse });
        drawDiskScaled(0f, RADAR_PLANE_Y + 0.008f, 0f, RADAR_RADIUS * 0.80f, 0.85f, RADAR_RADIUS * 0.85f * 0.80f, new float[] { primary[0], primary[1], primary[2], 0.055f + signalLevel * 0.03f });
    }

    private void drawRings(float[] secondary) {
        for (int i = 0; i < RING_RADII.length; i++) {
            float radius = RING_RADII[i] * RADAR_RADIUS;
            drawRingScaled(0f, RADAR_PLANE_Y + 0.003f * i, 0f, radius, radius * 0.85f, new float[] { secondary[0], secondary[1], secondary[2], 0.11f + i * 0.018f });
        }
        for (int i = 0; i < 8; i++) {
            Matrix.setIdentityM(modelMatrix, 0); Matrix.translateM(modelMatrix, 0, 0f, RADAR_PLANE_Y + 0.001f, 0f);
            Matrix.rotateM(modelMatrix, 0, i * 22.5f + worldPhase * 1.8f, 0f, 1f, 0f);
            Matrix.scaleM(modelMatrix, 0, RADAR_RADIUS * 0.94f, 1f, RADAR_RADIUS * 0.85f * 0.94f);
            drawLineSegment(modelMatrix, new float[] { secondary[0], secondary[1], secondary[2], 0.02f });
        }
    }

    private void drawOrbits(float[] primary, float[] secondary) {
        for (int o = 0; o < orbitVertexBufs.length; o++) {
            float[] verts = new float[(ORBIT_SEGMENTS + 1) * 6];
            float radius = ORBIT_RADII[o];
            float phaseOffset = orbitPhase * (0.9f + 0.22f * o) + o * 1.7f;
            for (int i = 0; i <= ORBIT_SEGMENTS; i++) {
                float angle = (float) (2.0 * Math.PI * i / ORBIT_SEGMENTS);
                float distortion = 0.012f * (float) Math.sin(angle * (2.2f + o) + phaseOffset);
                float yOff = RADAR_PLANE_Y + distortion + o * 0.004f;
                int idx = i * 6;
                verts[idx] = (radius - ORBIT_RIBBON_WIDTH) * (float)Math.cos(angle);
                verts[idx + 1] = yOff;
                verts[idx + 2] = (radius - ORBIT_RIBBON_WIDTH) * (float)Math.sin(angle);
                verts[idx + 3] = (radius + ORBIT_RIBBON_WIDTH) * (float)Math.cos(angle);
                verts[idx + 4] = yOff;
                verts[idx + 5] = (radius + ORBIT_RIBBON_WIDTH) * (float)Math.sin(angle);
            }
            FloatBuffer buf = makeFloatBuffer(verts);
            Matrix.setIdentityM(modelMatrix, 0);
            Matrix.rotateM(modelMatrix, 0, (float) Math.sin(worldPhase * (0.8f + o * 0.21f)) * (9f + o * 4f), 0f, 0f, 1f);
            float mix = o / (float)(ORBIT_RADII.length - 1);
            drawTriangleStrip(modelMatrix, buf, orbitVertexCount, new float[]{primary[0]*(1-mix)+secondary[0]*mix, primary[1]*(1-mix)+secondary[1]*mix, primary[2]*(1-mix)+secondary[2]*mix, 0.11f-o*0.016f});
        }
    }

    private void drawCells(float[] primary, float[] secondary) {
        float gridWorldSize = RADAR_RADIUS * 1.82f;
        float cellStep = gridWorldSize / LifeGrid.SIZE;
        for (int y = 0; y < LifeGrid.SIZE; y++) {
            for (int x = 0; x < LifeGrid.SIZE; x++) {
                int idx = y * LifeGrid.SIZE + x;
                float energy = energyBuf[idx];
                if (energy < 0.018f) continue;
                float wx = (x - LifeGrid.SIZE / 2f + 0.5f) * cellStep;
                float wz = (y - LifeGrid.SIZE / 2f + 0.5f) * cellStep;
                float dist = (float) Math.sqrt(wx * wx + wz * wz) / RADAR_RADIUS;
                if (dist > 1f) continue;
                float height = RADAR_PLANE_Y + 0.022f + energy * 0.22f + (1f - dist) * 0.02f;
                if (!aliveBuf[idx]) height -= 0.04f;
                float mix = Math.min(1f, energy * 1.2f);
                drawQuad(wx, height, wz, CELL_QUAD_SIZE * 0.84f + energy * 0.018f, worldPhase * 26f + x * 4f + y * 2f,
                    new float[]{primary[0]*(1-mix)+secondary[0]*mix, primary[1]*(1-mix)+secondary[1]*mix, primary[2]*(1-mix)+secondary[2]*mix, Math.min(1f, 0.12f + energy * 0.52f) * (1f - dist * 0.42f)});
            }
        }
    }

    private void drawQuantumField(float[] primary, float[] secondary) {
        int visible = Math.min(52 + Math.round(signalLevel * 44f), QUANTUM_PARTICLE_COUNT);
        for (int i = 0; i < visible; i++) {
            float angle = particleAngle[i] + worldPhase * particleSpeed[i] * (0.55f + rotationSpeed * 0.7f);
            float rad = particleRadius[i] * RADAR_RADIUS * 0.88f;
            float radian = (float) Math.toRadians(angle);
            float x = (float) Math.cos(radian) * rad;
            float z = (float) Math.sin(radian) * rad;
            float y = RADAR_PLANE_Y + (float) Math.sin(worldPhase * 1.4f + particlePhase[i]) * 0.06f - particleHeight[i] * 0.10f;
            float threatMix = Math.min(1f, particleThreatSeed[i] > 0.72f ? 0.28f + dangerLevel * 0.42f : (dangerLevel > 0.55f && i % 9 == 0 ? dangerLevel * 0.5f : 0f));
            float depth = Math.max(0f, Math.min(1f, (particleHeight[i] + 0.24f) / 0.98f));
            drawQuad(x, y, z, PARTICLE_QUAD_SIZE * (0.85f + depth * 1.35f) + particleRadius[i] * 0.004f, angle + particleTilt[i], new float[]{secondary[0]*(1-threatMix)+COLOR_DANGER_PRIMARY[0]*threatMix, secondary[1]*(1-threatMix)+COLOR_DANGER_PRIMARY[1]*threatMix, secondary[2]*(1-threatMix)+COLOR_DANGER_PRIMARY[2]*threatMix, 0.20f + depth * 0.42f + threatMix * 0.10f});
            if (i % 11 == 0) {
                drawRingScaled(x, y, z, 0.020f + particleRadius[i] * 0.012f, (0.020f + particleRadius[i] * 0.012f) * 0.42f,
                    new float[]{primary[0], primary[1], primary[2], 0.06f + signalLevel * 0.03f});
            }
        }
    }

    private void drawSweep(float[] primary, float[] secondary) {
        Matrix.setIdentityM(modelMatrix, 0); Matrix.translateM(modelMatrix, 0, 0f, RADAR_PLANE_Y + 0.006f, 0f);
        Matrix.rotateM(modelMatrix, 0, sweepAngleDeg, 0f, 1f, 0f);
        Matrix.scaleM(modelMatrix, 0, RADAR_RADIUS * 0.98f, 1f, RADAR_RADIUS * 0.85f * 0.98f);
        drawTriangleFan(modelMatrix, sweepVertexBuf, sweepVertexCount, new float[]{primary[0] * 0.95f + secondary[0] * 0.05f, primary[1] * 0.95f + secondary[1] * 0.05f, primary[2] * 0.95f + secondary[2] * 0.05f, 0.22f + signalLevel * 0.10f});

        Matrix.setIdentityM(modelMatrix, 0); Matrix.translateM(modelMatrix, 0, 0f, RADAR_PLANE_Y + 0.004f, 0f);
        Matrix.rotateM(modelMatrix, 0, sweepAngleDeg + 48f, 0f, 1f, 0f);
        Matrix.scaleM(modelMatrix, 0, RADAR_RADIUS * 0.92f, 1f, RADAR_RADIUS * 0.85f * 0.92f);
        drawTriangleFan(modelMatrix, sweepVertexBuf, sweepVertexCount, new float[]{secondary[0], secondary[1], secondary[2], 0.10f + signalLevel * 0.05f});
    }

    private void drawCorePulse(float[] primary, float[] secondary) {
        float pulse = pulseEnabled ? 0.50f + 0.50f * (float) Math.sin(worldPhase * 2.7f) : 0.35f;
        float glow = 0.10f + pulse * 0.04f;
        drawDiskScaled(0f, RADAR_PLANE_Y + 0.016f, 0f, glow * 2.2f, glow * 2.2f, glow * 2.2f, new float[]{secondary[0], secondary[1], secondary[2], 0.12f + pulse * 0.14f});
        drawDiskScaled(0f, RADAR_PLANE_Y + 0.02f, 0f, 0.05f + signalLevel * 0.018f, 0.05f + signalLevel * 0.018f, 0.05f + signalLevel * 0.018f, new float[]{0.96f, 0.99f, 1f, 0.82f});
        drawRingScaled(0f, RADAR_PLANE_Y + 0.02f, 0f, 0.18f + signalLevel * 0.05f, (0.18f + signalLevel * 0.05f) * 0.85f, new float[]{secondary[0], secondary[1], secondary[2], 0.22f + pulse * 0.18f});
    }

    private void drawDiskScaled(float tx, float ty, float tz, float sx, float sy, float sz, float[] color) {
        Matrix.setIdentityM(modelMatrix, 0); Matrix.translateM(modelMatrix, 0, tx, ty, tz); Matrix.scaleM(modelMatrix, 0, sx, sy, sz);
        drawTriangleFan(modelMatrix, diskVertexBuf, diskVertexCount, color);
    }

    private void drawRingScaled(float tx, float ty, float tz, float sx, float sz, float[] color) {
        Matrix.setIdentityM(modelMatrix, 0); Matrix.translateM(modelMatrix, 0, tx, ty, tz); Matrix.scaleM(modelMatrix, 0, sx, 1f, sz);
        drawLineStrip(modelMatrix, color);
    }

    private void drawQuad(float tx, float ty, float tz, float scale, float rotYDeg, float[] color) {
        Matrix.setIdentityM(modelMatrix, 0); Matrix.translateM(modelMatrix, 0, tx, ty, tz); Matrix.rotateM(modelMatrix, 0, rotYDeg, 0f, 1f, 0f); Matrix.scaleM(modelMatrix, 0, scale, 1f, scale);
        drawTriangleStrip(modelMatrix, quadVertexBuf, 4, color);
    }

    private void drawLineSegment(float[] m, float[] color) {
        FloatBuffer b = makeFloatBuffer(new float[]{0f, 0f, 0f, 1f, 0f, 0f});
        drawLines(m, b, 2, color);
    }

    private void drawTriangleFan(float[] m, FloatBuffer b, int count, float[] c) {
        Matrix.multiplyMM(mvpMatrix, 0, vpMatrix, 0, m, 0); GLES20.glUniformMatrix4fv(uMVPMatrixHandle, 1, false, mvpMatrix, 0);
        GLES20.glUniform4fv(uColorHandle, 1, c, 0); GLES20.glEnableVertexAttribArray(aPositionHandle);
        GLES20.glVertexAttribPointer(aPositionHandle, 3, GLES20.GL_FLOAT, false, 0, b); GLES20.glDrawArrays(GLES20.GL_TRIANGLE_FAN, 0, count);
    }

    private void drawTriangleStrip(float[] m, FloatBuffer b, int count, float[] c) {
        Matrix.multiplyMM(mvpMatrix, 0, vpMatrix, 0, m, 0); GLES20.glUniformMatrix4fv(uMVPMatrixHandle, 1, false, mvpMatrix, 0);
        GLES20.glUniform4fv(uColorHandle, 1, c, 0); GLES20.glEnableVertexAttribArray(aPositionHandle);
        GLES20.glVertexAttribPointer(aPositionHandle, 3, GLES20.GL_FLOAT, false, 0, b); GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, count);
    }

    private void drawLineStrip(float[] m, float[] c) {
        Matrix.multiplyMM(mvpMatrix, 0, vpMatrix, 0, m, 0); GLES20.glUniformMatrix4fv(uMVPMatrixHandle, 1, false, mvpMatrix, 0);
        GLES20.glUniform4fv(uColorHandle, 1, c, 0); GLES20.glLineWidth(1.2f); GLES20.glEnableVertexAttribArray(aPositionHandle);
        GLES20.glVertexAttribPointer(aPositionHandle, 3, GLES20.GL_FLOAT, false, 0, unitRingVertexBuf); GLES20.glDrawArrays(GLES20.GL_LINE_STRIP, 0, unitRingVertexCount);
    }

    private void drawLines(float[] m, FloatBuffer b, int count, float[] c) {
        Matrix.multiplyMM(mvpMatrix, 0, vpMatrix, 0, m, 0); GLES20.glUniformMatrix4fv(uMVPMatrixHandle, 1, false, mvpMatrix, 0);
        GLES20.glUniform4fv(uColorHandle, 1, c, 0); GLES20.glEnableVertexAttribArray(aPositionHandle);
        GLES20.glVertexAttribPointer(aPositionHandle, 3, GLES20.GL_FLOAT, false, 0, b); GLES20.glDrawArrays(GLES20.GL_LINES, 0, count);
    }

    public void setRotationSpeed(float s) { rotationSpeed = s; }
    public void setPulseEnabled(boolean e) { pulseEnabled = e; }
    public void setDangerLevel(float l) { dangerLevel = clamp01(l); grid.setDangerLevel(dangerLevel); }
    public void setSignalLevel(float l) { signalLevel = clamp01(l); grid.setSignalLevel(signalLevel); }
    private static float clamp01(float v) { return Math.max(0f, Math.min(1f, v)); }
    private static float[] lerpColor(float[] a, float[] b, float t) { return new float[]{a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t, a[3]+(b[3]-a[3])*t}; }
    private static FloatBuffer makeFloatBuffer(float[] d) { ByteBuffer bb = ByteBuffer.allocateDirect(d.length * 4); bb.order(ByteOrder.nativeOrder()); FloatBuffer fb = bb.asFloatBuffer(); fb.put(d); fb.position(0); return fb; }
    private static int createProgram(String v, String f) { int vs = loadShader(GLES20.GL_VERTEX_SHADER, v); int fs = loadShader(GLES20.GL_FRAGMENT_SHADER, f); int p = GLES20.glCreateProgram(); GLES20.glAttachShader(p, vs); GLES20.glAttachShader(p, fs); GLES20.glLinkProgram(p); return p; }
    private static int loadShader(int t, String s) { int sh = GLES20.glCreateShader(t); GLES20.glShaderSource(sh, s); GLES20.glCompileShader(sh); return sh; }
}
