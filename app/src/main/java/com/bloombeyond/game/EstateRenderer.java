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
    private final FloatBuffer cube, plane;
    private final Random rng=new Random(7);
    private int program,aPos,aNormal,uMvp,uModel,uColor,uFog,uCam;
    private float camX=0,camY=2.3f,camZ=13,yaw=180,pitch=-8;
    private boolean night=false,raining=false;
    private final float[][] trees=new float[34][4];
    private final float[][] drops=new float[120][3];
    private float fountainPhase=0f;

    private static final String VS=
        "uniform mat4 uMvp; uniform mat4 uModel; uniform vec3 uCam; attribute vec3 aPos; attribute vec3 aNormal;"+
        "varying float vLight; varying float vDist; void main(){vec4 world=uModel*vec4(aPos,1.0);"+
        "vec3 n=normalize(mat3(uModel)*aNormal); vec3 ld=normalize(vec3(-0.45,0.86,0.30));"+
        "vLight=max(dot(n,ld),0.0); vDist=distance(world.xyz,uCam); gl_Position=uMvp*vec4(aPos,1.0);}";
    private static final String FS=
        "precision mediump float; uniform vec4 uColor; uniform vec4 uFog; varying float vLight; varying float vDist;"+
        "void main(){float light=0.30+vLight*0.70; vec3 lit=uColor.rgb*light; float fog=smoothstep(17.0,40.0,vDist);"+
        "gl_FragColor=vec4(mix(lit,uFog.rgb,fog),uColor.a);}";

    public EstateRenderer(Context c){
        cube=buffer(makeCube()); plane=buffer(makePlane());
        for(int i=0;i<trees.length;i++){trees[i][0]=-15+rng.nextFloat()*30;trees[i][2]=-14+rng.nextFloat()*28;trees[i][1]=0;trees[i][3]=.75f+rng.nextFloat()*.8f;}
        for(int i=0;i<drops.length;i++){drops[i][0]=-12+rng.nextFloat()*24;drops[i][1]=rng.nextFloat()*14;drops[i][2]=-12+rng.nextFloat()*24;}
    }

    private float[] makeCube(){
        float[] d=new float[36*6]; int i=0;
        float[][] faces={
            {0,0,1,-.5f,-.5f,.5f,.5f,-.5f,.5f,.5f,.5f,.5f,-.5f,-.5f,.5f,.5f,.5f,.5f,-.5f,.5f,.5f},
            {0,0,-1,.5f,-.5f,-.5f,-.5f,-.5f,-.5f,-.5f,.5f,-.5f,.5f,-.5f,-.5f,-.5f,.5f,-.5f,.5f,.5f,-.5f},
            {0,1,0,-.5f,.5f,.5f,.5f,.5f,.5f,.5f,.5f,-.5f,-.5f,.5f,.5f,.5f,.5f,-.5f,-.5f,.5f,-.5f},
            {0,-1,0,-.5f,-.5f,-.5f,.5f,-.5f,-.5f,.5f,-.5f,.5f,-.5f,-.5f,-.5f,.5f,-.5f,.5f,-.5f,-.5f,.5f},
            {-1,0,0,-.5f,-.5f,-.5f,-.5f,-.5f,.5f,-.5f,.5f,.5f,-.5f,-.5f,-.5f,-.5f,.5f,.5f,-.5f,.5f,-.5f},
            {1,0,0,.5f,-.5f,.5f,.5f,-.5f,-.5f,.5f,.5f,-.5f,.5f,-.5f,.5f,.5f,.5f,-.5f,.5f,.5f,.5f}
        };
        for(float[] f:faces){for(int v=0;v<6;v++){int o=3+v*3;d[i++]=f[o];d[i++]=f[o+1];d[i++]=f[o+2];d[i++]=f[0];d[i++]=f[1];d[i++]=f[2];}}
        return d;
    }
    private float[] makePlane(){return new float[]{-0.5f,0,-0.5f,0,1,0, .5f,0,-.5f,0,1,0, .5f,0,.5f,0,1,0, -.5f,0,-.5f,0,1,0, .5f,0,.5f,0,1,0, -.5f,0,.5f,0,1,0};}
    private FloatBuffer buffer(float[] a){FloatBuffer b=ByteBuffer.allocateDirect(a.length*4).order(ByteOrder.nativeOrder()).asFloatBuffer();b.put(a).position(0);return b;}
    private int shader(int type,String s){int sh=GLES20.glCreateShader(type);GLES20.glShaderSource(sh,s);GLES20.glCompileShader(sh);return sh;}

    @Override public void onSurfaceCreated(javax.microedition.khronos.opengles.GL10 gl,javax.microedition.khronos.egl.EGLConfig cfg){
        int v=shader(GLES20.GL_VERTEX_SHADER,VS),f=shader(GLES20.GL_FRAGMENT_SHADER,FS);program=GLES20.glCreateProgram();GLES20.glAttachShader(program,v);GLES20.glAttachShader(program,f);GLES20.glLinkProgram(program);
        aPos=GLES20.glGetAttribLocation(program,"aPos");aNormal=GLES20.glGetAttribLocation(program,"aNormal");uMvp=GLES20.glGetUniformLocation(program,"uMvp");uModel=GLES20.glGetUniformLocation(program,"uModel");uColor=GLES20.glGetUniformLocation(program,"uColor");uFog=GLES20.glGetUniformLocation(program,"uFog");uCam=GLES20.glGetUniformLocation(program,"uCam");
        GLES20.glEnable(GLES20.GL_DEPTH_TEST);GLES20.glEnable(GLES20.GL_CULL_FACE);GLES20.glEnable(GLES20.GL_BLEND);GLES20.glBlendFunc(GLES20.GL_SRC_ALPHA,GLES20.GL_ONE_MINUS_SRC_ALPHA);
    }
    @Override public void onSurfaceChanged(javax.microedition.khronos.opengles.GL10 gl,int w,int h){GLES20.glViewport(0,0,w,h);Matrix.perspectiveM(projection,0,55f,w/(float)Math.max(1,h),0.1f,100f);}
    @Override public void onDrawFrame(javax.microedition.khronos.opengles.GL10 gl){
        float[] fog=night?new float[]{.025f,.045f,.10f,1}:new float[]{.48f,.69f,.82f,1};
        GLES20.glClearColor(fog[0],fog[1],fog[2],1);GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT|GLES20.GL_DEPTH_BUFFER_BIT);GLES20.glUseProgram(program);GLES20.glUniform4f(uFog,fog[0],fog[1],fog[2],1);GLES20.glUniform3f(uCam,camX,camY,camZ);
        float ry=(float)Math.toRadians(yaw),rp=(float)Math.toRadians(pitch);float dx=(float)(Math.sin(ry)*Math.cos(rp)),dy=(float)Math.sin(rp),dz=(float)(Math.cos(ry)*Math.cos(rp));Matrix.setLookAtM(view,0,camX,camY,camZ,camX+dx,camY+dy,camZ+dz,0,1,0);Matrix.multiplyMM(vp,0,projection,0,view,0);
        fountainPhase+=.035f;drawGround();drawPath();drawManor();drawGreenhouse();drawFountain();drawTerraces();drawTrees();drawFlowers();drawLamps();if(raining)drawRain();
    }

    private void prep(FloatBuffer b){b.position(0);GLES20.glEnableVertexAttribArray(aPos);GLES20.glVertexAttribPointer(aPos,3,GLES20.GL_FLOAT,false,24,b);b.position(3);GLES20.glEnableVertexAttribArray(aNormal);GLES20.glVertexAttribPointer(aNormal,3,GLES20.GL_FLOAT,false,24,b);}
    private void draw(FloatBuffer b,int count,float x,float y,float z,float sx,float sy,float sz,float r,float g,float bl,float a){Matrix.setIdentityM(model,0);Matrix.translateM(model,0,x,y,z);Matrix.scaleM(model,0,sx,sy,sz);Matrix.multiplyMM(mvp,0,vp,0,model,0);GLES20.glUniformMatrix4fv(uMvp,1,false,mvp,0);GLES20.glUniformMatrix4fv(uModel,1,false,model,0);float k=night?.58f:1f;GLES20.glUniform4f(uColor,r*k,g*k,bl*k,a);prep(b);GLES20.glDrawArrays(GLES20.GL_TRIANGLES,0,count);}
    private void box(float x,float y,float z,float sx,float sy,float sz,float r,float g,float b){draw(cube,36,x,y,z,sx,sy,sz,r,g,b,1);}
    private void plane(float x,float y,float z,float sx,float sz,float r,float g,float b,float a){draw(plane,6,x,y,z,sx,1,sz,r,g,b,a);}

    private void drawGround(){plane(0,-.02f,0,60,60,.18f,.43f,.23f,1);plane(0,.005f,-7,18,10,.24f,.48f,.26f,1);}
    private void drawPath(){for(int i=0;i<13;i++){float z=10-i*1.18f;box(0,.025f,z,3.4f,.05f,.88f,.62f,.57f,.49f);}for(int i=-5;i<=5;i++)box(i*.8f,.026f,1.7f,.72f,.05f,.72f,.60f,.55f,.48f);}
    private void drawManor(){
        box(0,2.0f,-7,7.8f,4.0f,3.4f,.79f,.71f,.60f);box(-4.2f,1.55f,-7.3f,1.6f,3.1f,2.5f,.72f,.65f,.55f);box(4.2f,1.55f,-7.3f,1.6f,3.1f,2.5f,.72f,.65f,.55f);
        box(0,4.25f,-7,8.3f,.55f,3.8f,.30f,.16f,.18f);box(0,1.35f,-5.20f,1.25f,2.7f,.22f,.26f,.16f,.11f);
        for(int row=0;row<2;row++)for(int side=-1;side<=1;side+=2){float x=side*(2.0f+row*.55f);box(x,2.25f+row*.85f,-5.17f,.78f,.95f,.10f,.23f,.53f,.72f);box(x,2.25f+row*.85f,-5.11f,.04f,1.0f,.02f,.90f,.89f,.78f);}
        box(-3.25f,.85f,-5.12f,.65f,1.55f,.12f,.25f,.54f,.72f);box(3.25f,.85f,-5.12f,.65f,1.55f,.12f,.25f,.54f,.72f);
        if(night){for(int side=-1;side<=1;side+=2){box(side*2.0f,2.35f,-5.08f,.65f,.75f,.04f,1f,.72f,.22f);box(side*3.25f,.88f,-5.06f,.52f,1.25f,.04f,1f,.70f,.20f);}}
    }
    private void drawGreenhouse(){
        box(-7.5f,1.3f,-.5f,4.6f,2.6f,3.5f,.22f,.48f,.43f);plane(-7.5f,2.62f,-.5f,4.7f,3.6f,.38f,.70f,.70f,.44f);
        for(int i=-3;i<=3;i++){box(-7.5f+i*.68f,1.3f,1.28f,.055f,2.6f,.055f,.78f,.84f,.83f);box(-7.5f+i*.68f,1.3f,-2.28f,.055f,2.6f,.055f,.78f,.84f,.83f);}for(int j=0;j<3;j++)box(-7.5f,.45f+j*.85f,1.28f,4.5f,.045f,.05f,.78f,.84f,.83f);
    }
    private void drawFountain(){
        box(5.2f,.20f,1.0f,6.8f,.34f,4.8f,.66f,.68f,.64f);plane(5.2f,.39f,1.0f,6.2f,4.2f,.18f,.50f,.72f,.70f);box(5.2f,.72f,1.0f,.72f,1.28f,.72f,.70f,.69f,.65f);box(5.2f,1.48f,1.0f,.18f,1.5f,.18f,.73f,.72f,.68f);
        for(int i=0;i<8;i++){double a=i*Math.PI/4;float r=1.1f,x=5.2f+(float)Math.cos(a)*r,z=1f+(float)Math.sin(a)*r;float h=.5f+(float)Math.sin(fountainPhase+i*.6f)*.16f;box(x,.72f+h*.5f,z,.045f,h,.045f,.50f,.76f,.92f);}
    }
    private void drawTerraces(){box(0,.14f,-3.55f,9.5f,.25f,1.25f,.58f,.54f,.49f);for(int i=-5;i<=5;i++){box(i*.75f,.52f,-3.32f,.12f,.78f,.12f,.67f,.64f,.59f);}}
    private void drawTrees(){for(float[] t:trees){float s=t[3];box(t[0],1.15f*s,t[2],.34f*s,2.3f*s,.34f*s,.30f,.18f,.10f);box(t[0],3.0f*s,t[2],1.95f*s,2.25f*s,1.95f*s,.13f,.39f,.16f);box(t[0]-.7f*s,2.75f*s,t[2]+.25f*s,1.25f*s,1.55f*s,1.25f*s,.15f,.44f,.18f);}}
    private void drawFlowers(){for(int i=0;i<22;i++){float x=-4.8f+(i%11)*.92f,z=3.2f+(i/11)*.65f;box(x,.20f,z,.06f,.40f,.06f,.18f,.42f,.18f);box(x,.44f,z,.22f,.18f,.22f,(i%3==0?.82f:.92f),(i%3==1?.60f:.36f),(i%3==2?.72f:.48f));}}
    private void drawLamps(){for(int i=-3;i<=3;i+=2){float x=i*1.15f;box(x,.7f,4.9f,.12f,1.4f,.12f,.16f,.15f,.13f);box(x,1.48f,4.9f,.32f,.35f,.32f,night?1f:.78f,night?.67f:.62f,night?.20f:.42f);}}
    private void drawRain(){for(float[] d:drops){d[1]-=.24f;if(d[1]<.2f){d[1]=10+rng.nextFloat()*6;d[0]=camX-10+rng.nextFloat()*20;d[2]=camZ-10+rng.nextFloat()*20;}box(d[0],d[1],d[2],.018f,.30f,.018f,.55f,.74f,1f);}}

    public void rotateCamera(float dx,float dy){yaw+=dx;pitch=Math.max(-38,Math.min(22,pitch+dy));}
    public void moveForward(float a){float r=(float)Math.toRadians(yaw);camX+=(float)Math.sin(r)*a;camZ+=(float)Math.cos(r)*a;clamp();}
    public void strafe(float a){float r=(float)Math.toRadians(yaw+90);camX+=(float)Math.sin(r)*a;camZ+=(float)Math.cos(r)*a;clamp();}
    private void clamp(){camX=Math.max(-18,Math.min(18,camX));camZ=Math.max(-18,Math.min(18,camZ));}
    public void toggleDayNight(){night=!night;}
    public void toggleRain(){raining=!raining;}
    public boolean isNight(){return night;} public boolean isRaining(){return raining;}
}
