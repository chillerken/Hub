package com.bloombeyond.game;

import android.content.Context;
import android.opengl.GLES20;
import android.opengl.GLSurfaceView;
import android.opengl.Matrix;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;
import java.util.Random;

public class EstateRenderer implements GLSurfaceView.Renderer {
    private final float[] projection=new float[16], view=new float[16], model=new float[16], mvp=new float[16], vp=new float[16];
    private final FloatBuffer cube, ground, water;
    private final Random rng=new Random(7);
    private int program,aPos,uMvp,uColor;
    private float camX=0,camY=2.3f,camZ=13,yaw=180,pitch=-8;
    private boolean night=false,raining=false;
    private final float[][] trees=new float[26][3];
    private final float[][] drops=new float[90][3];

    private static final String VS="uniform mat4 uMvp; attribute vec3 aPos; void main(){gl_Position=uMvp*vec4(aPos,1.0);}";
    private static final String FS="precision mediump float; uniform vec4 uColor; void main(){gl_FragColor=uColor;}";

    public EstateRenderer(Context c){
        cube=buffer(new float[]{-0.5f,-0.5f,0.5f, 0.5f,-0.5f,0.5f, 0.5f,0.5f,0.5f, -0.5f,-0.5f,0.5f, 0.5f,0.5f,0.5f, -0.5f,0.5f,0.5f, -0.5f,-0.5f,-0.5f,-0.5f,0.5f,-0.5f,0.5f,0.5f,-0.5f,-0.5f,-0.5f,-0.5f,0.5f,0.5f,-0.5f,0.5f,-0.5f, -0.5f,0.5f,-0.5f,-0.5f,0.5f,0.5f,0.5f,0.5f,0.5f,-0.5f,0.5f,-0.5f,0.5f,0.5f,0.5f,0.5f,0.5f,-0.5f,-0.5f,-0.5f,-0.5f,-0.5f,0.5f,0.5f,-0.5f,0.5f,-0.5f,-0.5f,-0.5f,0.5f,-0.5f,0.5f,0.5f,-0.5f,-0.5f, -0.5f,-0.5f,-0.5f,-0.5f,-0.5f,0.5f,-0.5f,0.5f,0.5f,-0.5f,-0.5f,-0.5f,-0.5f,0.5f,0.5f,-0.5f,0.5f,-0.5f, 0.5f,-0.5f,-0.5f,0.5f,0.5f,-0.5f,0.5f,0.5f,0.5f,0.5f,-0.5f,-0.5f,0.5f,0.5f,0.5f,0.5f,-0.5f,0.5f});
        ground=buffer(new float[]{-30,0,-30,30,0,-30,30,0,30,-30,0,-30,30,0,30,-30,0,30});
        water=buffer(new float[]{-3,0,-2,3,0,-2,3,0,2,-3,0,-2,3,0,2,-3,0,2});
        for(int i=0;i<trees.length;i++){trees[i][0]=-13+rng.nextFloat()*26;trees[i][2]=-12+rng.nextFloat()*24;trees[i][1]=0;}
        for(int i=0;i<drops.length;i++){drops[i][0]=-10+rng.nextFloat()*20;drops[i][1]=rng.nextFloat()*12;drops[i][2]=-10+rng.nextFloat()*20;}
    }

    private FloatBuffer buffer(float[] a){FloatBuffer b=ByteBuffer.allocateDirect(a.length*4).order(ByteOrder.nativeOrder()).asFloatBuffer();b.put(a).position(0);return b;}
    private int shader(int type,String s){int sh=GLES20.glCreateShader(type);GLES20.glShaderSource(sh,s);GLES20.glCompileShader(sh);return sh;}
    @Override public void onSurfaceCreated(javax.microedition.khronos.opengles.GL10 gl,javax.microedition.khronos.egl.EGLConfig cfg){
        int v=shader(GLES20.GL_VERTEX_SHADER,VS),f=shader(GLES20.GL_FRAGMENT_SHADER,FS);program=GLES20.glCreateProgram();GLES20.glAttachShader(program,v);GLES20.glAttachShader(program,f);GLES20.glLinkProgram(program);aPos=GLES20.glGetAttribLocation(program,"aPos");uMvp=GLES20.glGetUniformLocation(program,"uMvp");uColor=GLES20.glGetUniformLocation(program,"uColor");GLES20.glEnable(GLES20.GL_DEPTH_TEST);GLES20.glEnable(GLES20.GL_CULL_FACE);
    }
    @Override public void onSurfaceChanged(javax.microedition.khronos.opengles.GL10 gl,int w,int h){GLES20.glViewport(0,0,w,h);Matrix.perspectiveM(projection,0,55f,w/(float)Math.max(1,h),0.1f,100f);}
    @Override public void onDrawFrame(javax.microedition.khronos.opengles.GL10 gl){
        if(night)GLES20.glClearColor(0.018f,0.035f,0.085f,1);else GLES20.glClearColor(0.42f,0.67f,0.86f,1);GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT|GLES20.GL_DEPTH_BUFFER_BIT);GLES20.glUseProgram(program);
        float ry=(float)Math.toRadians(yaw),rp=(float)Math.toRadians(pitch);float dx=(float)(Math.sin(ry)*Math.cos(rp)),dy=(float)Math.sin(rp),dz=(float)(Math.cos(ry)*Math.cos(rp));Matrix.setLookAtM(view,0,camX,camY,camZ,camX+dx,camY+dy,camZ+dz,0,1,0);Matrix.multiplyMM(vp,0,projection,0,view,0);
        drawGround();drawManor();drawGreenhouse();drawFountain();drawTrees();drawPath();if(raining)drawRain();
    }

    private void prep(FloatBuffer b){GLES20.glEnableVertexAttribArray(aPos);GLES20.glVertexAttribPointer(aPos,3,GLES20.GL_FLOAT,false,12,b);}
    private void color(float r,float g,float b,float a){float k=night?0.48f:1f;GLES20.glUniform4f(uColor,r*k,g*k,b*k,a);}
    private void drawBuffer(FloatBuffer b,int count,float x,float y,float z,float sx,float sy,float sz,float r,float g,float bl){Matrix.setIdentityM(model,0);Matrix.translateM(model,0,x,y,z);Matrix.scaleM(model,0,sx,sy,sz);Matrix.multiplyMM(mvp,0,vp,0,model,0);GLES20.glUniformMatrix4fv(uMvp,1,false,mvp,0);color(r,g,bl,1);prep(b);GLES20.glDrawArrays(GLES20.GL_TRIANGLES,0,count);}
    private void box(float x,float y,float z,float sx,float sy,float sz,float r,float g,float b){drawBuffer(cube,36,x,y,z,sx,sy,sz,r,g,b);}
    private void drawGround(){drawBuffer(ground,6,0,0,0,1,1,1,0.18f,0.45f,0.24f);}
    private void drawManor(){box(0,2,-7,7,4,3,0.78f,0.70f,0.58f);box(0,4.35f,-7,7.5f,0.6f,3.3f,0.34f,0.18f,0.20f);box(0,1.3f,-3.9f,1.2f,2.6f,0.4f,0.30f,0.19f,0.13f);for(int s=-1;s<=1;s+=2){box(2.0f*s,2.2f,-3.8f,1.0f,1.4f,0.25f,0.25f,0.58f,0.79f);}if(night){box(-2.0f,2.2f,-3.65f,0.8f,1.1f,0.1f,1f,0.75f,0.27f);box(2.0f,2.2f,-3.65f,0.8f,1.1f,0.1f,1f,0.75f,0.27f);}}
    private void drawGreenhouse(){box(-7,1.4f,-1,4,2.8f,3,0.30f,0.55f,0.50f);for(int i=-2;i<=2;i++)box(-7+i*.75f,1.4f,0.55f,.08f,2.8f,.08f,.75f,.84f,.85f);}
    private void drawFountain(){drawBuffer(water,6,5,0.06f,1,1,1,1,0.20f,0.52f,0.72f);box(5,0.25f,1,6.6f,0.28f,4.6f,0.65f,0.67f,0.63f);box(5,0.55f,1,0.65f,1.1f,0.65f,0.70f,0.69f,0.64f);box(5,1.25f,1,0.18f,1.5f,0.18f,0.72f,0.70f,0.66f);}
    private void drawTrees(){for(float[] t:trees){box(t[0],1.2f,t[2],0.38f,2.4f,0.38f,0.34f,0.20f,0.11f);box(t[0],3.0f,t[2],2.0f,2.3f,2.0f,0.16f,0.42f,0.18f);}}
    private void drawPath(){for(int i=0;i<9;i++)box(0,0.03f,7-i*1.25f,3.2f,0.06f,0.85f,0.62f,0.58f,0.50f);}
    private void drawRain(){for(float[] d:drops){d[1]-=.18f;if(d[1]<.2f)d[1]=10+rng.nextFloat()*5;box(d[0],d[1],d[2],.025f,.33f,.025f,.58f,.75f,1f);}}
    public void rotateCamera(float dx,float dy){yaw+=dx;pitch=Math.max(-40,Math.min(25,pitch+dy));}
    public void moveForward(float a){float r=(float)Math.toRadians(yaw);camX+=(float)Math.sin(r)*a;camZ+=(float)Math.cos(r)*a;camX=Math.max(-18,Math.min(18,camX));camZ=Math.max(-18,Math.min(18,camZ));}
    public void strafe(float a){float r=(float)Math.toRadians(yaw+90);camX+=(float)Math.sin(r)*a;camZ+=(float)Math.cos(r)*a;}
    public void toggleDayNight(){night=!night;}
    public void toggleRain(){raining=!raining;}
    public boolean isNight(){return night;} public boolean isRaining(){return raining;}
}
