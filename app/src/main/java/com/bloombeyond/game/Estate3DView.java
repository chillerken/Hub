package com.bloombeyond.game;

import android.content.Context;
import android.opengl.GLSurfaceView;
import android.view.MotionEvent;

public class Estate3DView extends GLSurfaceView {
    private final EstateRenderer renderer;
    private float lastX, lastY;

    public Estate3DView(Context context) {
        super(context);
        setEGLContextClientVersion(2);
        setPreserveEGLContextOnPause(true);
        renderer = new EstateRenderer(context);
        setRenderer(renderer);
        setRenderMode(GLSurfaceView.RENDERMODE_CONTINUOUSLY);
    }

    @Override public boolean onTouchEvent(MotionEvent e) {
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                lastX = e.getX(); lastY = e.getY(); return true;
            case MotionEvent.ACTION_MOVE:
                float dx = e.getX() - lastX;
                float dy = e.getY() - lastY;
                lastX = e.getX(); lastY = e.getY();
                queueEvent(() -> renderer.rotateCamera(dx * 0.18f, dy * 0.12f));
                return true;
            default: return true;
        }
    }

    public void moveForward() { queueEvent(() -> renderer.moveForward(0.75f)); }
    public void moveBackward() { queueEvent(() -> renderer.moveForward(-0.75f)); }
    public void strafeLeft() { queueEvent(() -> renderer.strafe(-0.75f)); }
    public void strafeRight() { queueEvent(() -> renderer.strafe(0.75f)); }
    public void toggleDayNight() { queueEvent(renderer::toggleDayNight); }
    public void toggleRain() { queueEvent(renderer::toggleRain); }
    public boolean isNight() { return renderer.isNight(); }
    public boolean isRaining() { return renderer.isRaining(); }
}
