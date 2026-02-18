package com.radartinder.app.radarlife;

import java.util.Random;

/**
 * Hybrid Conway Game-of-Life engine with radar signal injection.
 * 36x36 toroidal grid ticked at ~8 Hz from the GL thread.
 */
public class LifeGrid {

    public static final int SIZE = 36;

    private static final float ALIVE_ENERGY_BOOST = 0.15f;
    private static final float DEAD_ENERGY_DECAY  = 0.92f;
    private static final float INJECTION_BASE     = 0.4f;
    private static final float ALIVE_INITIAL_ENERGY = 0.6f;
    private static final float SEED_DENSITY = 0.18f;

    private boolean[][] alive     = new boolean[SIZE][SIZE];
    private boolean[][] nextAlive = new boolean[SIZE][SIZE];
    private float[][]   energy    = new float[SIZE][SIZE];

    private volatile float signalLevel = 0f;
    private volatile float dangerLevel = 0f;

    private final Random rng = new Random();

    public LifeGrid() {
        seed();
    }

    public void seed() {
        for (int y = 0; y < SIZE; y++) {
            for (int x = 0; x < SIZE; x++) {
                alive[y][x] = rng.nextFloat() < SEED_DENSITY;
                energy[y][x] = alive[y][x] ? ALIVE_INITIAL_ENERGY : 0f;
            }
        }
    }

    /**
     * Advance one generation.  Must be called from a single thread
     * (the GL thread is fine).  Reads are synchronised via {@link #getEnergy}
     * and {@link #isAlive}.
     */
    public synchronized void tick() {
        // --- 1. Conway step (toroidal) ---
        for (int y = 0; y < SIZE; y++) {
            for (int x = 0; x < SIZE; x++) {
                int n = countNeighbors(x, y);
                if (alive[y][x]) {
                    nextAlive[y][x] = (n == 2 || n == 3);
                } else {
                    nextAlive[y][x] = (n == 3);
                }
            }
        }

        // Swap buffers
        boolean[][] tmp = alive;
        alive = nextAlive;
        nextAlive = tmp;

        // --- 2. Energy update ---
        for (int y = 0; y < SIZE; y++) {
            for (int x = 0; x < SIZE; x++) {
                if (alive[y][x]) {
                    energy[y][x] = Math.min(1.0f, energy[y][x] + ALIVE_ENERGY_BOOST);
                } else {
                    energy[y][x] *= DEAD_ENERGY_DECAY;
                    if (energy[y][x] < 0.01f) energy[y][x] = 0f;
                }
            }
        }

        // --- 3. Radar signal injection ---
        injectRadarSignal();
    }

    // -------- internals --------

    private int countNeighbors(int x, int y) {
        int count = 0;
        for (int dy = -1; dy <= 1; dy++) {
            for (int dx = -1; dx <= 1; dx++) {
                if (dx == 0 && dy == 0) continue;
                int nx = (x + dx + SIZE) % SIZE;
                int ny = (y + dy + SIZE) % SIZE;
                if (alive[ny][nx]) count++;
            }
        }
        return count;
    }

    private void injectRadarSignal() {
        int cx = SIZE / 2;
        int cy = SIZE / 2;
        float strength = INJECTION_BASE + signalLevel * 0.4f + dangerLevel * 0.3f;
        int radius = 3 + (int) (signalLevel * 5);

        for (int dy = -radius; dy <= radius; dy++) {
            for (int dx = -radius; dx <= radius; dx++) {
                float dist = (float) Math.sqrt(dx * dx + dy * dy);
                if (dist > radius) continue;

                int nx = (cx + dx + SIZE) % SIZE;
                int ny = (cy + dy + SIZE) % SIZE;
                float falloff = 1.0f - (dist / (radius + 1));
                float injected = strength * falloff * (0.7f + rng.nextFloat() * 0.3f);

                energy[ny][nx] = Math.min(1.0f, energy[ny][nx] + injected * 0.3f);

                // Stochastically birth cells near the hotspot
                if (!alive[ny][nx] && rng.nextFloat() < injected * 0.1f) {
                    alive[ny][nx] = true;
                }
            }
        }
    }

    // -------- thread-safe accessors (called from GL draw) --------

    public synchronized float getEnergy(int x, int y) {
        return energy[y][x];
    }

    public synchronized boolean isAlive(int x, int y) {
        return alive[y][x];
    }

    /**
     * Bulk-copy energy grid for the renderer so the lock is held only once.
     */
    public synchronized void copyEnergyTo(float[] dest) {
        for (int y = 0; y < SIZE; y++) {
            System.arraycopy(energy[y], 0, dest, y * SIZE, SIZE);
        }
    }

    /**
     * Bulk-copy alive grid for the renderer.
     */
    public synchronized void copyAliveTo(boolean[] dest) {
        for (int y = 0; y < SIZE; y++) {
            for (int x = 0; x < SIZE; x++) {
                dest[y * SIZE + x] = alive[y][x];
            }
        }
    }

    // -------- prop setters (UI thread) --------

    public void setSignalLevel(float level) {
        signalLevel = Math.max(0, Math.min(1, level));
    }

    public void setDangerLevel(float level) {
        dangerLevel = Math.max(0, Math.min(1, level));
    }
}
