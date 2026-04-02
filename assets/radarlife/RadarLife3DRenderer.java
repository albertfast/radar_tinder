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

/**
 * OpenGL ES 2.0 renderer for an immersive radar scene.
 *
 * Scene intent:
 *   1. A translucent spherical shell, like a floating world
 *   2. A refined upper radar plane with contour rings and orbit ribbons
 *   3. Conway cells rising above the plane as signal echoes
 *   4. A lower-hemisphere "quantum" particle field with constant motion
 *   5. A dynamic sweep beam binding both halves together
 */
public class RadarLife3DRenderer implements GLSurfaceView.Renderer {

    private static final long TICK_INTERVAL_NS = 125_000_000L;

    private static final float[] COLOR_NORMAL_PRIMARY = { 0.306f, 0.804f, 0.769f, 1f };
    private static final float[] COLOR_NORMAL_SECONDARY = { 0.220f, 0.741f, 0.973f, 1f };
    private static final float[] COLOR_DANGER_PRIMARY = { 1.000f, 0.322f, 0.322f, 1f };
    private static final float[] COLOR_DANGER_SECONDARY = { 1.000f, 0.420f, 0.231f, 1f };
    private static final float[] COLOR_WORLD_GLOW = { 0.090f, 0.310f, 0.560f, 1f };

    private static final float CAMERA_TILT_DEG = 27f;
    private static final float CAMERA_DISTANCE = 4.15f;
    private static final float FOV_DEG = 41f;

    private static final int DISK_SEGMENTS = 72;
    private static final int RING_SEGMENTS = 72;
    private static final int SWEEP_SEGMENTS = 20;
    private static final int ORBIT_SEGMENTS = 96;

    private static final float SCENE_SPHERE_RADIUS = 1.28f;
    private static final float RADAR_PLANE_Y = 0.12f;
    private static final float RADAR_RADIUS = 0.98f;
    private static final float CELL_QUAD_SIZE = 0.022f;
    private static final float PARTICLE_QUAD_SIZE = 0.013f;
    private static final float ORBIT_RIBBON_WIDTH = 0.016f;
    private static final float[] RING_RADII = { 0.22f, 0.42f, 0.62f, 0.82f, 1.0f };
    private static final float[] ORBIT_RADII = { 0.36f, 0.56f, 0.79f };

    private static final int QUANTUM_PARTICLE_COUNT = 42;

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
        Matrix.setLookAtM(viewMatrix, 0,
            0f, eyeY, eyeZ,
            0f, 0.08f, 0f,
            0f, 1f, 0f);

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
            particleRadius[i] = 0.22f + rng.nextFloat() * 0.52f;
            particleHeight[i] = -0.18f - rng.nextFloat() * 0.46f;
            particleSpeed[i] = 8f + rng.nextFloat() * 14f;
            particlePhase[i] = rng.nextFloat() * 6.28318f;
            particleTilt[i] = -16f + rng.nextFloat() * 32f;
            particleThreatSeed[i] = rng.nextFloat();
        }
    }

    private void buildDiskGeometry() {
        diskVertexCount = DISK_SEGMENTS + 2;
        float[] verts = new float[diskVertexCount * 3];
        verts[0] = 0f;
        verts[1] = 0f;
        verts[2] = 0f;

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
        verts[0] = 0f;
        verts[1] = 0f;
        verts[2] = 0f;

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
        orbitVertexCount = (ORBIT_SEGMENTS + 1) * 2;
        orbitVertexBufs = new FloatBuffer[ORBIT_RADII.length];

        for (int o = 0; o < ORBIT_RADII.length; o++) {
            float radius = ORBIT_RADII[o];
            float[] verts = new float[orbitVertexCount * 3];
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
    }

    private void buildQuadGeometry() {
        float h = 0.5f;
        float[] verts = {
            -h, 0f, -h,
             h, 0f, -h,
            -h, 0f,  h,
             h, 0f,  h,
        };
        quadVertexBuf = makeFloatBuffer(verts);
    }

    private void drawSphereShell(float[] shellGlow, float[] secondary) {
        float scale = SCENE_SPHERE_RADIUS;

        drawDiskScaled(0f, 0f, 0f, scale, scale, scale,
            new float[] { shellGlow[0], shellGlow[1], shellGlow[2], 0.085f + signalLevel * 0.04f });

        float[] latitudes = { -0.56f, -0.22f, 0.16f, 0.46f };
        for (int i = 0; i < latitudes.length; i++) {
            float y = latitudes[i] * SCENE_SPHERE_RADIUS;
            float ringScale = (float) Math.sqrt(Math.max(0.05f, 1f - latitudes[i] * latitudes[i])) * SCENE_SPHERE_RADIUS;
            float alpha = 0.08f + i * 0.026f;
            drawRingScaled(0f, y, 0f, ringScale, ringScale,
                new float[] { shellGlow[0], shellGlow[1], shellGlow[2], alpha });
        }

        for (int i = 0; i < 4; i++) {
            Matrix.setIdentityM(modelMatrix, 0);
            Matrix.rotateM(modelMatrix, 0, i * 45f + worldPhase * 9f, 0f, 1f, 0f);
            Matrix.rotateM(modelMatrix, 0, 90f, 0f, 0f, 1f);
            Matrix.scaleM(modelMatrix, 0, scale, scale, scale);
            drawLineStrip(modelMatrix, new float[] {
                secondary[0], secondary[1], secondary[2], 0.12f + i * 0.012f
            });
        }
    }

    private void drawWorldAura(float[] shellGlow) {
        float breathe = pulseEnabled
            ? 0.06f + 0.02f * (float) Math.sin(worldPhase * 2.3f)
            : 0.05f;

        drawDiskScaled(0f, -0.02f, 0f,
            SCENE_SPHERE_RADIUS * 1.06f,
            SCENE_SPHERE_RADIUS * 0.74f,
            SCENE_SPHERE_RADIUS * 1.06f,
            new float[] { shellGlow[0], shellGlow[1], shellGlow[2], breathe });
    }

    private void drawRadarDisk(float[] primary) {
        float pulse = pulseEnabled
            ? 0.12f + 0.03f * (float) Math.sin(worldPhase * 3.1f)
            : 0.10f;

        drawDiskScaled(0f, RADAR_PLANE_Y, 0f, RADAR_RADIUS, 1f, RADAR_RADIUS,
            new float[] { primary[0] * 0.24f, primary[1] * 0.24f, primary[2] * 0.24f, pulse * 0.88f });

        drawDiskScaled(0f, RADAR_PLANE_Y + 0.01f, 0f,
            RADAR_RADIUS * 0.84f, 1f, RADAR_RADIUS * 0.84f,
            new float[] { primary[0], primary[1], primary[2], 0.035f + signalLevel * 0.02f });
    }

    private void drawRings(float[] secondary) {
        for (int i = 0; i < RING_RADII.length; i++) {
            float radius = RING_RADII[i] * RADAR_RADIUS;
            float alpha = 0.09f + i * 0.02f;
            drawRingScaled(0f, RADAR_PLANE_Y + 0.002f * i, 0f, radius, radius,
                new float[] { secondary[0], secondary[1], secondary[2], alpha });
        }

        for (int i = 0; i < 8; i++) {
            Matrix.setIdentityM(modelMatrix, 0);
            Matrix.translateM(modelMatrix, 0, 0f, RADAR_PLANE_Y + 0.001f, 0f);
            Matrix.rotateM(modelMatrix, 0, i * 22.5f + worldPhase * 1.8f, 0f, 1f, 0f);
            Matrix.scaleM(modelMatrix, 0, RADAR_RADIUS * 0.92f, 1f, RADAR_RADIUS * 0.92f);
            drawLineSegment(modelMatrix, new float[] {
                secondary[0], secondary[1], secondary[2], 0.035f
            });
        }
    }

    private void drawOrbits(float[] primary, float[] secondary) {
        for (int o = 0; o < orbitVertexBufs.length; o++) {
            float[] verts = new float[orbitVertexCount * 3];
            float radius = ORBIT_RADII[o];
            float phaseOffset = orbitPhase * (0.9f + 0.22f * o) + o * 1.7f;

            for (int i = 0; i <= ORBIT_SEGMENTS; i++) {
                float angle = (float) (2.0 * Math.PI * i / ORBIT_SEGMENTS);
                float cos = (float) Math.cos(angle);
                float sin = (float) Math.sin(angle);
                float distortion = 0.018f * (float) Math.sin(angle * (2.2f + o) + phaseOffset);
                float yOff = RADAR_PLANE_Y + 0.04f + distortion + o * 0.01f;
                int idx = i * 6;

                verts[idx] = (radius - ORBIT_RIBBON_WIDTH) * cos;
                verts[idx + 1] = yOff;
                verts[idx + 2] = (radius - ORBIT_RIBBON_WIDTH) * sin;
                verts[idx + 3] = (radius + ORBIT_RIBBON_WIDTH) * cos;
                verts[idx + 4] = yOff;
                verts[idx + 5] = (radius + ORBIT_RIBBON_WIDTH) * sin;
            }

            FloatBuffer buf = makeFloatBuffer(verts);
            Matrix.setIdentityM(modelMatrix, 0);
            Matrix.rotateM(modelMatrix, 0, o * 18f + worldPhase * (8f + o * 3f), 0f, 1f, 0f);

            float mix = o / (float) (orbitVertexBufs.length - 1);
            float[] color = {
                primary[0] * (1f - mix) + secondary[0] * mix,
                primary[1] * (1f - mix) + secondary[1] * mix,
                primary[2] * (1f - mix) + secondary[2] * mix,
                0.075f + o * 0.025f
            };

            drawTriangleStrip(modelMatrix, buf, orbitVertexCount, color);
        }
    }

    private void drawCells(float[] primary, float[] secondary) {
        int size = LifeGrid.SIZE;
        float gridWorldSize = RADAR_RADIUS * 1.82f;
        float cellStep = gridWorldSize / size;

        for (int y = 0; y < size; y++) {
            for (int x = 0; x < size; x++) {
                int idx = y * size + x;
                float energy = energyBuf[idx];
                if (energy < 0.018f) {
                    continue;
                }

                float wx = (x - size / 2f + 0.5f) * cellStep;
                float wz = (y - size / 2f + 0.5f) * cellStep;
                float dist = (float) Math.sqrt(wx * wx + wz * wz) / RADAR_RADIUS;
                if (dist > 1f) {
                    continue;
                }

                float height = RADAR_PLANE_Y + 0.022f + energy * 0.22f + (1f - dist) * 0.02f;
                if (!aliveBuf[idx]) {
                    height -= 0.04f;
                }

                float colorMix = Math.min(1f, energy * 1.2f);
                float[] color = {
                    primary[0] * (1f - colorMix) + secondary[0] * colorMix,
                    primary[1] * (1f - colorMix) + secondary[1] * colorMix,
                    primary[2] * (1f - colorMix) + secondary[2] * colorMix,
                    Math.min(1f, 0.12f + energy * 0.52f) * (1f - dist * 0.42f)
                };

                drawQuad(wx, height, wz,
                    CELL_QUAD_SIZE * 0.84f + energy * 0.018f,
                    worldPhase * 26f + x * 4f + y * 2f,
                    color);
            }
        }
    }

    private void drawQuantumField(float[] primary, float[] secondary) {
        int visible = 10 + Math.round(signalLevel * 18f);
        visible = Math.min(visible, QUANTUM_PARTICLE_COUNT);

        for (int i = 0; i < visible; i++) {
            float angle = particleAngle[i] + worldPhase * particleSpeed[i] * rotationSpeed;
            float rad = particleRadius[i] * (0.74f + signalLevel * 0.18f);
            float radian = (float) Math.toRadians(angle);

            float x = (float) Math.cos(radian) * rad;
            float z = (float) Math.sin(radian) * rad;
            float wave = 0.04f * (float) Math.sin(worldPhase * 1.7f + particlePhase[i]);
            float y = particleHeight[i] - 0.12f * particleRadius[i] + wave;

            float baselineThreat = particleThreatSeed[i] > 0.72f
                ? 0.28f + dangerLevel * 0.42f
                : 0f;
            float reactiveThreat = (dangerLevel > 0.55f && i % 9 == 0)
                ? dangerLevel * 0.5f
                : 0f;
            float threatMix = Math.min(1f, Math.max(baselineThreat, reactiveThreat));
            float[] base = {
                secondary[0] * (1f - threatMix) + COLOR_DANGER_PRIMARY[0] * threatMix,
                secondary[1] * (1f - threatMix) + COLOR_DANGER_PRIMARY[1] * threatMix,
                secondary[2] * (1f - threatMix) + COLOR_DANGER_PRIMARY[2] * threatMix,
                0.06f + signalLevel * 0.08f + threatMix * 0.08f
            };

            drawQuad(x, y, z,
                PARTICLE_QUAD_SIZE * 0.82f + particleRadius[i] * 0.006f,
                angle + particleTilt[i],
                base);

            if (i % 10 == 0) {
                drawRingScaled(x, y, z,
                    0.026f + particleRadius[i] * 0.008f,
                    0.026f + particleRadius[i] * 0.008f,
                    new float[] { primary[0], primary[1], primary[2], 0.035f + signalLevel * 0.03f });
            }
        }
    }

    private void drawSweep(float[] primary, float[] secondary) {
        Matrix.setIdentityM(modelMatrix, 0);
        Matrix.translateM(modelMatrix, 0, 0f, RADAR_PLANE_Y + 0.004f, 0f);
        Matrix.rotateM(modelMatrix, 0, sweepAngleDeg, 0f, 1f, 0f);
        Matrix.scaleM(modelMatrix, 0,
            RADAR_RADIUS * (0.94f + signalLevel * 0.05f),
            1f,
            RADAR_RADIUS * (0.94f + signalLevel * 0.05f));

        float[] beamColor = {
            primary[0] * 0.92f + secondary[0] * 0.08f,
            primary[1] * 0.92f + secondary[1] * 0.08f,
            primary[2] * 0.92f + secondary[2] * 0.08f,
            0.12f + signalLevel * 0.07f
        };
        drawTriangleFan(modelMatrix, sweepVertexBuf, sweepVertexCount, beamColor);
    }

    private void drawCorePulse(float[] primary, float[] secondary) {
        float pulse = pulseEnabled
            ? 0.12f + 0.04f * (float) Math.sin(worldPhase * 4.8f)
            : 0.10f;

        drawDiskScaled(0f, RADAR_PLANE_Y + 0.018f, 0f,
            0.06f + signalLevel * 0.02f,
            1f,
            0.06f + signalLevel * 0.02f,
            new float[] { primary[0], primary[1], primary[2], 0.34f + pulse * 0.6f });

        drawRingScaled(0f, RADAR_PLANE_Y + 0.02f, 0f,
            0.14f + signalLevel * 0.05f,
            0.14f + signalLevel * 0.05f,
            new float[] { secondary[0], secondary[1], secondary[2], 0.18f + pulse * 0.24f });
    }

    private void drawDiskScaled(float tx, float ty, float tz,
                                float sx, float sy, float sz,
                                float[] color) {
        Matrix.setIdentityM(modelMatrix, 0);
        Matrix.translateM(modelMatrix, 0, tx, ty, tz);
        Matrix.scaleM(modelMatrix, 0, sx, sy, sz);
        drawTriangleFan(modelMatrix, diskVertexBuf, diskVertexCount, color);
    }

    private void drawRingScaled(float tx, float ty, float tz,
                                float sx, float sz,
                                float[] color) {
        Matrix.setIdentityM(modelMatrix, 0);
        Matrix.translateM(modelMatrix, 0, tx, ty, tz);
        Matrix.scaleM(modelMatrix, 0, sx, 1f, sz);
        drawLineStrip(modelMatrix, color);
    }

    private void drawQuad(float tx, float ty, float tz, float scale, float rotYDeg, float[] color) {
        Matrix.setIdentityM(modelMatrix, 0);
        Matrix.translateM(modelMatrix, 0, tx, ty, tz);
        Matrix.rotateM(modelMatrix, 0, rotYDeg, 0f, 1f, 0f);
        Matrix.scaleM(modelMatrix, 0, scale, 1f, scale);
        drawTriangleStrip(modelMatrix, quadVertexBuf, 4, color);
    }

    private void drawLineSegment(float[] baseModelMatrix, float[] color) {
        float[] verts = {
            0f, 0f, 0f,
            1f, 0f, 0f
        };
        FloatBuffer buf = makeFloatBuffer(verts);
        drawLines(baseModelMatrix, buf, 2, color);
    }

    private void drawTriangleFan(float[] baseModelMatrix, FloatBuffer vertexBuf, int vertexCount, float[] color) {
        Matrix.multiplyMM(mvpMatrix, 0, vpMatrix, 0, baseModelMatrix, 0);
        GLES20.glUniformMatrix4fv(uMVPMatrixHandle, 1, false, mvpMatrix, 0);
        GLES20.glUniform4fv(uColorHandle, 1, color, 0);
        GLES20.glEnableVertexAttribArray(aPositionHandle);
        GLES20.glVertexAttribPointer(aPositionHandle, 3, GLES20.GL_FLOAT, false, 0, vertexBuf);
        GLES20.glDrawArrays(GLES20.GL_TRIANGLE_FAN, 0, vertexCount);
        GLES20.glDisableVertexAttribArray(aPositionHandle);
    }

    private void drawTriangleStrip(float[] baseModelMatrix, FloatBuffer vertexBuf, int vertexCount, float[] color) {
        Matrix.multiplyMM(mvpMatrix, 0, vpMatrix, 0, baseModelMatrix, 0);
        GLES20.glUniformMatrix4fv(uMVPMatrixHandle, 1, false, mvpMatrix, 0);
        GLES20.glUniform4fv(uColorHandle, 1, color, 0);
        GLES20.glEnableVertexAttribArray(aPositionHandle);
        GLES20.glVertexAttribPointer(aPositionHandle, 3, GLES20.GL_FLOAT, false, 0, vertexBuf);
        GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, vertexCount);
        GLES20.glDisableVertexAttribArray(aPositionHandle);
    }

    private void drawLineStrip(float[] baseModelMatrix, float[] color) {
        Matrix.multiplyMM(mvpMatrix, 0, vpMatrix, 0, baseModelMatrix, 0);
        GLES20.glUniformMatrix4fv(uMVPMatrixHandle, 1, false, mvpMatrix, 0);
        GLES20.glUniform4fv(uColorHandle, 1, color, 0);
        GLES20.glLineWidth(1.2f);
        GLES20.glEnableVertexAttribArray(aPositionHandle);
        GLES20.glVertexAttribPointer(aPositionHandle, 3, GLES20.GL_FLOAT, false, 0, unitRingVertexBuf);
        GLES20.glDrawArrays(GLES20.GL_LINE_STRIP, 0, unitRingVertexCount);
        GLES20.glDisableVertexAttribArray(aPositionHandle);
    }

    private void drawLines(float[] baseModelMatrix, FloatBuffer vertexBuf, int vertexCount, float[] color) {
        Matrix.multiplyMM(mvpMatrix, 0, vpMatrix, 0, baseModelMatrix, 0);
        GLES20.glUniformMatrix4fv(uMVPMatrixHandle, 1, false, mvpMatrix, 0);
        GLES20.glUniform4fv(uColorHandle, 1, color, 0);
        GLES20.glEnableVertexAttribArray(aPositionHandle);
        GLES20.glVertexAttribPointer(aPositionHandle, 3, GLES20.GL_FLOAT, false, 0, vertexBuf);
        GLES20.glDrawArrays(GLES20.GL_LINES, 0, vertexCount);
        GLES20.glDisableVertexAttribArray(aPositionHandle);
    }

    public void setRotationSpeed(float speed) {
        rotationSpeed = speed;
    }

    public void setPulseEnabled(boolean enabled) {
        pulseEnabled = enabled;
    }

    public void setDangerLevel(float level) {
        dangerLevel = clamp01(level);
    }

    public void setSignalLevel(float level) {
        signalLevel = clamp01(level);
    }

    private static float clamp01(float value) {
        return Math.max(0f, Math.min(1f, value));
    }

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
        int program = GLES20.glCreateProgram();
        GLES20.glAttachShader(program, vs);
        GLES20.glAttachShader(program, fs);
        GLES20.glLinkProgram(program);
        return program;
    }

    private static int loadShader(int type, String source) {
        int shader = GLES20.glCreateShader(type);
        GLES20.glShaderSource(shader, source);
        GLES20.glCompileShader(shader);
        return shader;
    }
}
