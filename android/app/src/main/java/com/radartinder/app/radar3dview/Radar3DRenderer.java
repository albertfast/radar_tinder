package com.radartinder.app.radar3dview;

import android.content.Context;
import android.opengl.GLES20;
import android.opengl.GLSurfaceView;
import android.opengl.Matrix;

import javax.microedition.khronos.egl.EGLConfig;
import javax.microedition.khronos.opengles.GL10;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;
import java.util.Random;

public class Radar3DRenderer implements GLSurfaceView.Renderer {
    private final Context context;
    private final float[] projectionMatrix = new float[16];
    private final float[] viewMatrix = new float[16];
    private final float[] modelMatrix = new float[16];
    private final float[] mvpMatrix = new float[16];
    
    // Animasyon değişkenleri
    private float rotationAngle = 0f;
    private float pulseScale = 1f;
    private float pulseDirection = 1f;
    private long lastTime = 0;
    
    // Radar hedefleri için rastgele konumlar
    private final RadarBlip[] radarBlips = new RadarBlip[8];
    private final Random random = new Random();
    
    // Shader programları
    private int radarShaderProgram;
    private int blipShaderProgram;
    
    // Buffer'lar
    private FloatBuffer radarVertices;
    private FloatBuffer radarLines;
    
    public Radar3DRenderer(Context context) {
        this.context = context;
        
        // Radar hedeflerini rastgele konumlarda oluştur
        for (int i = 0; i < radarBlips.length; i++) {
            float angle = (float) (i * 45 * Math.PI / 180);
            float distance = 0.3f + random.nextFloat() * 0.4f;
            float height = random.nextFloat() * 0.2f - 0.1f;
            
            radarBlips[i] = new RadarBlip(
                (float) (Math.cos(angle) * distance),
                height,
                (float) (Math.sin(angle) * distance),
                random.nextFloat() * 0.02f + 0.01f
            );
        }
        
        initializeBuffers();
    }
    
    private void initializeBuffers() {
        // Radar taban vertices (dairesel taban)
        float[] radarBaseVertices = new float[362 * 3]; // Merkez + 360 nokta
        radarBaseVertices[0] = 0f; // X
        radarBaseVertices[1] = 0f; // Y
        radarBaseVertices[2] = 0f; // Z
        
        for (int i = 1; i <= 360; i++) {
            double angle = (i - 1) * Math.PI / 180;
            radarBaseVertices[i * 3] = (float) (Math.cos(angle) * 0.5f); // X
            radarBaseVertices[i * 3 + 1] = 0f; // Y
            radarBaseVertices[i * 3 + 2] = (float) (Math.sin(angle) * 0.5f); // Z
        }
        
        // Radar çizgileri (halkalar)
        float[] radarLineVertices = new float[4 * 360 * 3]; // 4 halka * 360 nokta
        
        for (int ring = 0; ring < 4; ring++) {
            float radius = 0.125f * (ring + 1);
            for (int i = 0; i < 360; i++) {
                double angle = i * Math.PI / 180;
                int index = (ring * 360 + i) * 3;
                radarLineVertices[index] = (float) (Math.cos(angle) * radius); // X
                radarLineVertices[index + 1] = 0f; // Y
                radarLineVertices[index + 2] = (float) (Math.sin(angle) * radius); // Z
            }
        }
        
        // ByteBuffer oluştur
        ByteBuffer bb = ByteBuffer.allocateDirect(radarBaseVertices.length * 4);
        bb.order(ByteOrder.nativeOrder());
        radarVertices = bb.asFloatBuffer();
        radarVertices.put(radarBaseVertices);
        radarVertices.position(0);
        
        bb = ByteBuffer.allocateDirect(radarLineVertices.length * 4);
        bb.order(ByteOrder.nativeOrder());
        radarLines = bb.asFloatBuffer();
        radarLines.put(radarLineVertices);
        radarLines.position(0);
    }
    
    @Override
    public void onSurfaceCreated(GL10 unused, EGLConfig config) {
        // Arka plan rengini ayarla (koyu mavi)
        GLES20.glClearColor(0.05f, 0.08f, 0.14f, 1.0f);
        
        // Derinlik testini etkinleştir
        GLES20.glEnable(GLES20.GL_DEPTH_TEST);
        
        // Shader programlarını derle
        radarShaderProgram = createShaderProgram(
            "uniform mat4 uMVPMatrix;" +
            "attribute vec4 aPosition;" +
            "varying vec3 vPosition;" +
            "void main() {" +
            "  gl_Position = uMVPMatrix * aPosition;" +
            "  vPosition = aPosition.xyz;" +
            "}",
            
            "precision mediump float;" +
            "varying vec3 vPosition;" +
            "void main() {" +
            "  float dist = length(vPosition);" +
            "  vec3 color = mix(vec3(0.1, 0.3, 0.4), vec3(0.3, 0.8, 0.8), dist * 2.0);" +
            "  gl_FragColor = vec4(color, 0.8);" +
            "}"
        );
        
        blipShaderProgram = createShaderProgram(
            "uniform mat4 uMVPMatrix;" +
            "attribute vec4 aPosition;" +
            "void main() {" +
            "  gl_Position = uMVPMatrix * aPosition;" +
            "  gl_PointSize = 20.0;" +
            "}",
            
            "precision mediump float;" +
            "void main() {" +
            "  vec2 coord = gl_PointCoord - vec2(0.5);" +
            "  float dist = length(coord);" +
            "  if (dist > 0.5) discard;" +
            "  float alpha = 1.0 - smoothstep(0.3, 0.5, dist);" +
            "  gl_FragColor = vec4(1.0, 0.3, 0.3, alpha);" +
            "}"
        );
    }
    
    @Override
    public void onSurfaceChanged(GL10 unused, int width, int height) {
        GLES20.glViewport(0, 0, width, height);
        
        float ratio = (float) width / height;
        
        // Perspektif projeksiyon matrisi
        Matrix.perspectiveM(projectionMatrix, 0, 45, ratio, 0.1f, 10f);
        
        // Kamera matrisi (yukarıdan bakış)
        Matrix.setLookAtM(viewMatrix, 0, 
            0, 1.5f, 1.0f,  // Kamera pozisyonu
            0, 0, 0,        // Bakış noktası
            0, 1, 0);       // Yukarı vektörü
    }
    
    @Override
    public void onDrawFrame(GL10 unused) {
        long currentTime = System.currentTimeMillis();
        if (lastTime == 0) lastTime = currentTime;
        float deltaTime = (currentTime - lastTime) / 1000f;
        lastTime = currentTime;
        
        // Ekranı temizle
        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT | GLES20.GL_DEPTH_BUFFER_BIT);
        
        // Animasyonları güncelle
        rotationAngle += deltaTime * 30f; // 30 derece/saniye
        pulseScale += deltaTime * pulseDirection * 0.5f;
        if (pulseScale > 1.2f || pulseScale < 0.8f) {
            pulseDirection *= -1;
        }
        
        // Model matrisini ayarla (rotasyon ve ölçekleme)
        Matrix.setIdentityM(modelMatrix, 0);
        Matrix.rotateM(modelMatrix, 0, rotationAngle, 0, 1, 0);
        Matrix.scaleM(modelMatrix, 0, pulseScale, 1f, pulseScale);
        
        // MVP matrisini hesapla
        Matrix.multiplyMM(mvpMatrix, 0, viewMatrix, 0, modelMatrix, 0);
        Matrix.multiplyMM(mvpMatrix, 0, projectionMatrix, 0, mvpMatrix, 0);
        
        // Radar tabanını çiz
        drawRadarBase();
        
        // Radar çizgilerini çiz
        drawRadarLines();
        
        // Radar hedeflerini çiz
        drawRadarBlips();
    }
    
    private void drawRadarBase() {
        GLES20.glUseProgram(radarShaderProgram);
        
        // Vertex attributeleri ayarla
        int positionHandle = GLES20.glGetAttribLocation(radarShaderProgram, "aPosition");
        GLES20.glEnableVertexAttribArray(positionHandle);
        GLES20.glVertexAttribPointer(positionHandle, 3, GLES20.GL_FLOAT, false, 0, radarVertices);
        
        // MVP matrisini ayarla
        int mvpHandle = GLES20.glGetUniformLocation(radarShaderProgram, "uMVPMatrix");
        GLES20.glUniformMatrix4fv(mvpHandle, 1, false, mvpMatrix, 0);
        
        // Çizim modunu ayarla ve çiz
        GLES20.glDrawArrays(GLES20.GL_TRIANGLE_FAN, 0, 361);
        
        // Temizle
        GLES20.glDisableVertexAttribArray(positionHandle);
    }
    
    private void drawRadarLines() {
        GLES20.glUseProgram(radarShaderProgram);
        
        // Vertex attributeleri ayarla
        int positionHandle = GLES20.glGetAttribLocation(radarShaderProgram, "aPosition");
        GLES20.glEnableVertexAttribArray(positionHandle);
        GLES20.glVertexAttribPointer(positionHandle, 3, GLES20.GL_FLOAT, false, 0, radarLines);
        
        // MVP matrisini ayarla
        int mvpHandle = GLES20.glGetUniformLocation(radarShaderProgram, "uMVPMatrix");
        GLES20.glUniformMatrix4fv(mvpHandle, 1, false, mvpMatrix, 0);
        
        // Çizgileri çiz (her halka için)
        for (int ring = 0; ring < 4; ring++) {
            GLES20.glDrawArrays(GLES20.GL_LINE_LOOP, ring * 360, 360);
        }
        
        // Temizle
        GLES20.glDisableVertexAttribArray(positionHandle);
    }
    
    private void drawRadarBlips() {
        GLES20.glUseProgram(blipShaderProgram);
        
        // Vertex attributeleri ayarla
        int positionHandle = GLES20.glGetAttribLocation(blipShaderProgram, "aPosition");
        GLES20.glEnableVertexAttribArray(positionHandle);
        
        // MVP matrisini ayarla
        int mvpHandle = GLES20.glGetUniformLocation(blipShaderProgram, "uMVPMatrix");
        GLES20.glUniformMatrix4fv(mvpHandle, 1, false, mvpMatrix, 0);
        
        // Her hedefi çiz
        for (RadarBlip blip : radarBlips) {
            ByteBuffer bb = ByteBuffer.allocateDirect(3 * 4);
            bb.order(ByteOrder.nativeOrder());
            FloatBuffer vertexBuffer = bb.asFloatBuffer();
            vertexBuffer.put(new float[] { blip.x, blip.y, blip.z });
            vertexBuffer.position(0);
            
            GLES20.glVertexAttribPointer(positionHandle, 3, GLES20.GL_FLOAT, false, 0, vertexBuffer);
            GLES20.glDrawArrays(GLES20.GL_POINTS, 0, 1);
        }
        
        // Temizle
        GLES20.glDisableVertexAttribArray(positionHandle);
    }
    
    private int createShaderProgram(String vertexCode, String fragmentCode) {
        // Vertex shader
        int vertexShader = GLES20.glCreateShader(GLES20.GL_VERTEX_SHADER);
        GLES20.glShaderSource(vertexShader, vertexCode);
        GLES20.glCompileShader(vertexShader);
        
        // Fragment shader
        int fragmentShader = GLES20.glCreateShader(GLES20.GL_FRAGMENT_SHADER);
        GLES20.glShaderSource(fragmentShader, fragmentCode);
        GLES20.glCompileShader(fragmentShader);
        
        // Program
        int program = GLES20.glCreateProgram();
        GLES20.glAttachShader(program, vertexShader);
        GLES20.glAttachShader(program, fragmentShader);
        GLES20.glLinkProgram(program);
        
        return program;
    }
    
    public void onResume() {
        // Gerekirse kaynakları yeniden yükle
    }
    
    public void onPause() {
        // Gerekirse kaynakları serbest bırak
    }
    
    // Radar hedefi için yardımcı sınıf
    private static class RadarBlip {
        public final float x, y, z, size;
        
        public RadarBlip(float x, float y, float z, float size) {
            this.x = x;
            this.y = y;
            this.z = z;
            this.size = size;
        }
    }
}