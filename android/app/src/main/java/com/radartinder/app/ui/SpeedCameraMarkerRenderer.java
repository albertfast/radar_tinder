package com.radartinder.app.ui;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RadialGradient;
import android.graphics.RectF;
import android.graphics.Shader;
import android.util.Base64;

import java.io.ByteArrayOutputStream;

/** Renders an isometric 3D speed camera to a transparent ARGB bitmap. */
public final class SpeedCameraMarkerRenderer {
    private SpeedCameraMarkerRenderer() {}

    public static String renderToDataUri(int sizePx) {
        int safeSize = Math.max(48, Math.min(sizePx, 256));
        Bitmap bitmap = Bitmap.createBitmap(safeSize, safeSize, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        drawMarker(canvas, safeSize);
        ByteArrayOutputStream stream = new ByteArrayOutputStream();
        bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream);
        bitmap.recycle();
        String base64 = Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP);
        return "data:image/png;base64," + base64;
    }

    private static void drawMarker(Canvas canvas, int size) {
        float cx = size * 0.5f;
        float cy = size * 0.56f;
        float scale = size / 96f;

        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);

        // Ground shadow (soft, no white fill)
        paint.setColor(Color.argb(70, 0, 0, 0));
        canvas.drawOval(
            cx - 22f * scale,
            cy + 24f * scale,
            cx + 22f * scale,
            cy + 32f * scale,
            paint
        );

        // Pole
        paint.setShader(
            new LinearGradient(
                cx - 3f * scale,
                cy + 8f * scale,
                cx + 3f * scale,
                cy + 28f * scale,
                new int[] { Color.rgb(55, 65, 82), Color.rgb(28, 35, 48) },
                null,
                Shader.TileMode.CLAMP
            )
        );
        canvas.drawRoundRect(
            cx - 3.5f * scale,
            cy + 4f * scale,
            cx + 3.5f * scale,
            cy + 30f * scale,
            2f * scale,
            2f * scale,
            paint
        );
        paint.setShader(null);

        // Camera housing (isometric box)
        float boxW = 34f * scale;
        float boxH = 22f * scale;
        float top = cy - 18f * scale;
        float left = cx - boxW * 0.5f;

        Path body = new Path();
        body.moveTo(left, top + boxH * 0.35f);
        body.lineTo(left + boxW * 0.12f, top);
        body.lineTo(left + boxW * 0.88f, top);
        body.lineTo(left + boxW, top + boxH * 0.35f);
        body.lineTo(left + boxW, top + boxH);
        body.lineTo(left, top + boxH);
        body.close();

        paint.setShader(
            new LinearGradient(
                left,
                top,
                left + boxW,
                top + boxH,
                new int[] { Color.rgb(38, 48, 62), Color.rgb(18, 24, 36) },
                null,
                Shader.TileMode.CLAMP
            )
        );
        canvas.drawPath(body, paint);
        paint.setShader(null);

        // Top face highlight
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(1.2f * scale);
        paint.setColor(Color.argb(90, 120, 200, 220));
        Path topEdge = new Path();
        topEdge.moveTo(left + boxW * 0.12f, top + 1f * scale);
        topEdge.lineTo(left + boxW * 0.88f, top + 1f * scale);
        canvas.drawPath(topEdge, paint);
        paint.setStyle(Paint.Style.FILL);

        // Lens barrel
        float lensCx = cx + 4f * scale;
        float lensCy = cy - 4f * scale;
        float lensR = 11f * scale;

        paint.setShader(
            new RadialGradient(
                lensCx - 2f * scale,
                lensCy - 2f * scale,
                lensR * 1.2f,
                new int[] { Color.rgb(45, 212, 191), Color.rgb(14, 116, 144) },
                null,
                Shader.TileMode.CLAMP
            )
        );
        canvas.drawCircle(lensCx, lensCy, lensR, paint);
        paint.setShader(null);

        // Lens ring
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(2f * scale);
        paint.setColor(Color.rgb(226, 77, 77));
        canvas.drawCircle(lensCx, lensCy, lensR + 1.5f * scale, paint);
        paint.setStyle(Paint.Style.FILL);

        // Lens glass
        paint.setColor(Color.argb(200, 220, 250, 255));
        canvas.drawCircle(lensCx - 2f * scale, lensCy - 2f * scale, lensR * 0.35f, paint);

        // Status LED
        paint.setColor(Color.rgb(248, 113, 113));
        canvas.drawCircle(left + boxW * 0.22f, top + boxH * 0.55f, 2.5f * scale, paint);

        // Turquoise accent stripe
        paint.setColor(Color.argb(180, 45, 212, 191));
        RectF stripe = new RectF(left + 2f * scale, top + boxH * 0.72f, left + boxW - 2f * scale, top + boxH * 0.82f);
        canvas.drawRoundRect(stripe, 1f * scale, 1f * scale, paint);
    }
}
