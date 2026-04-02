package com.radartinder.app.radarlife;

import java.util.Random;

public class LifeGrid {
    public static final int SIZE = 24;
    private boolean[] current = new boolean[SIZE * SIZE];
    private boolean[] next = new boolean[SIZE * SIZE];
    private float[] energy = new float[SIZE * SIZE];
    private final Random rng = new Random();

    public LifeGrid() {
        seed();
    }

    public synchronized void seed() {
        for (int i = 0; i < current.length; i++) {
            current[i] = rng.nextFloat() < 0.15f;
            energy[i] = current[i] ? 1.0f : 0.0f;
        }
    }

    public synchronized void tick() {
        for (int y = 0; y < SIZE; y++) {
            for (int x = 0; x < SIZE; x++) {
                int neighbors = countNeighbors(x, y);
                int idx = y * SIZE + x;
                if (current[idx]) {
                    next[idx] = neighbors == 2 || neighbors == 3;
                } else {
                    next[idx] = neighbors == 3;
                }
            }
        }
        boolean[] temp = current;
        current = next;
        next = temp;

        for (int i = 0; i < energy.length; i++) {
            if (current[i]) {
                energy[i] = Math.min(1.0f, energy[i] + 0.15f);
            } else {
                energy[i] = Math.max(0.0f, energy[i] - 0.08f);
            }
        }
    }

    private int countNeighbors(int x, int y) {
        int count = 0;
        for (int dy = -1; dy <= 1; dy++) {
            for (int dx = -1; dx <= 1; dx++) {
                if (dx == 0 && dy == 0) continue;
                int nx = (x + dx + SIZE) % SIZE;
                int ny = (y + dy + SIZE) % SIZE;
                if (current[ny * SIZE + nx]) count++;
            }
        }
        return count;
    }

    public synchronized void copyEnergyTo(float[] dest) {
        System.arraycopy(energy, 0, dest, 0, energy.length);
    }

    public synchronized void copyAliveTo(boolean[] dest) {
        System.arraycopy(current, 0, dest, 0, current.length);
    }
}
