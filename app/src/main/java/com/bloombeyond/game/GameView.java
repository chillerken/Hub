package com.bloombeyond.game;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.*;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.MotionEvent;
import android.view.View;
import java.util.Random;

public class GameView extends View {
    private static final int N = 8, TYPES = 6;
    private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Random rng = new Random();
    private final SharedPreferences prefs;
    private final Vibrator vibrator;
    private final int[][] board = new int[N][N];
    private int level, score, moves, target, coins;
    private int selR=-1, selC=-1;
    private float boardLeft, boardTop, cell;
    private String banner = "";
    private long bannerUntil = 0;
    private boolean levelOver=false, won=false;
    private final int[] colors = {
        Color.rgb(242,94,129), Color.rgb(255,181,71), Color.rgb(88,199,153),
        Color.rgb(82,158,240), Color.rgb(155,111,238), Color.rgb(244,113,221)
    };

    public GameView(Context c) {
        super(c);
        setLayerType(View.LAYER_TYPE_SOFTWARE, null);
        prefs = c.getSharedPreferences("bloom_save", Context.MODE_PRIVATE);
        vibrator = (Vibrator)c.getSystemService(Context.VIBRATOR_SERVICE);
        level = Math.max(1, prefs.getInt("level",1));
        coins = prefs.getInt("coins",0);
        text.setTypeface(Typeface.create("sans", Typeface.BOLD));
        startLevel(level);
    }

    private void startLevel(int l) {
        level=l; score=0; moves=Math.max(16, 28-(l/3)); target=900 + (l-1)*260;
        levelOver=false; won=false; selR=selC=-1;
        do { fillRandom(); } while(hasAnyMatch());
        showBanner("Level " + level + " • Restore the estate");
        invalidate();
    }

    private void fillRandom() {
        for(int r=0;r<N;r++) for(int c=0;c<N;c++) {
            int v;
            do { v=rng.nextInt(TYPES); } while((c>=2 && board[r][c-1]==v && board[r][c-2]==v) || (r>=2 && board[r-1][c]==v && board[r-2][c]==v));
            board[r][c]=v;
        }
    }

    @Override protected void onDraw(Canvas c) {
        super.onDraw(c);
        int w=getWidth(), h=getHeight();
        drawBackground(c,w,h);
        drawHeader(c,w);
        cell=Math.min((w-36f)/N, (h*0.60f)/N);
        boardLeft=(w-cell*N)/2f; boardTop=h*0.24f;
        drawBoard(c);
        drawFooter(c,w,h);
        if(System.currentTimeMillis()<bannerUntil) drawBanner(c,w,h);
        if(levelOver) drawOverlay(c,w,h);
    }

    private void drawBackground(Canvas c,int w,int h){
        LinearGradient g=new LinearGradient(0,0,0,h,Color.rgb(31,47,74),Color.rgb(19,28,48),Shader.TileMode.CLAMP);
        p.setShader(g); c.drawRect(0,0,w,h,p); p.setShader(null);
        p.setColor(Color.argb(28,255,255,255));
        for(int i=0;i<14;i++) c.drawCircle((i*97)%w, (i*181)%h, 30+(i%4)*16,p);
    }

    private void drawHeader(Canvas c,int w){
        text.setTextAlign(Paint.Align.CENTER); text.setColor(Color.WHITE); text.setTextSize(dp(28));
        c.drawText("BLOOM & BEYOND",w/2f,dp(42),text);
        text.setTextSize(dp(13)); text.setColor(Color.rgb(205,219,241));
        c.drawText("MATCH • RESTORE • DISCOVER",w/2f,dp(63),text);
        float y=dp(88); drawPill(c,w*.18f,y,"LEVEL",String.valueOf(level)); drawPill(c,w*.50f,y,"MOVES",String.valueOf(moves)); drawPill(c,w*.82f,y,"COINS",String.valueOf(coins));
        text.setTextSize(dp(14)); text.setColor(Color.WHITE); c.drawText("Score " + score + " / " + target,w/2f,dp(145),text);
        p.setColor(Color.argb(65,255,255,255)); c.drawRoundRect(w*.14f,dp(154),w*.86f,dp(164),dp(8),dp(8),p);
        float prog=Math.min(1f,score/(float)target); p.setColor(Color.rgb(101,218,164)); c.drawRoundRect(w*.14f,dp(154),w*.14f+(w*.72f)*prog,dp(164),dp(8),dp(8),p);
    }

    private void drawPill(Canvas c,float x,float y,String lab,String val){
        float rw=dp(96), rh=dp(52); p.setColor(Color.argb(150,14,24,42)); c.drawRoundRect(x-rw/2,y-rh/2,x+rw/2,y+rh/2,dp(16),dp(16),p);
        text.setTextAlign(Paint.Align.CENTER); text.setColor(Color.rgb(165,183,211)); text.setTextSize(dp(10)); c.drawText(lab,x,y-dp(4),text);
        text.setColor(Color.WHITE); text.setTextSize(dp(18)); c.drawText(val,x,y+dp(17),text);
    }

    private void drawBoard(Canvas c){
        p.setColor(Color.argb(90,4,10,22)); c.drawRoundRect(boardLeft-dp(8),boardTop-dp(8),boardLeft+cell*N+dp(8),boardTop+cell*N+dp(8),dp(22),dp(22),p);
        for(int r=0;r<N;r++) for(int col=0;col<N;col++) drawGem(c,r,col);
    }

    private void drawGem(Canvas c,int r,int col){
        float cx=boardLeft+col*cell+cell/2, cy=boardTop+r*cell+cell/2, rad=cell*.38f;
        p.setColor(Color.argb(45,255,255,255)); c.drawCircle(cx,cy,rad*1.06f,p);
        p.setShadowLayer(dp(5),0,dp(3),Color.argb(90,0,0,0)); p.setColor(colors[board[r][col]]);
        Path path=new Path(); int type=board[r][col];
        if(type==0){ path.moveTo(cx,cy-rad); path.cubicTo(cx+rad,cy-rad*.5f,cx+rad,cy+rad*.5f,cx,cy+rad); path.cubicTo(cx-rad,cy+rad*.5f,cx-rad,cy-rad*.5f,cx,cy-rad); }
        else if(type==1){ for(int i=0;i<8;i++){ double a=-Math.PI/2+i*Math.PI/4; float rr=(i%2==0?rad:rad*.72f); float x=cx+(float)Math.cos(a)*rr,y=cy+(float)Math.sin(a)*rr; if(i==0)path.moveTo(x,y);else path.lineTo(x,y);} path.close(); }
        else if(type==2){ path.addRoundRect(cx-rad,cy-rad,cx+rad,cy+rad,rad*.35f,rad*.35f,Path.Direction.CW); }
        else if(type==3){ path.moveTo(cx,cy-rad);path.lineTo(cx+rad,cy);path.lineTo(cx,cy+rad);path.lineTo(cx-rad,cy);path.close(); }
        else if(type==4){ for(int i=0;i<6;i++){ double a=-Math.PI/2+i*Math.PI/3; float x=cx+(float)Math.cos(a)*rad,y=cy+(float)Math.sin(a)*rad; if(i==0)path.moveTo(x,y);else path.lineTo(x,y);}path.close(); }
        else { path.addOval(cx-rad*.88f,cy-rad,cx+rad*.88f,cy+rad,Path.Direction.CW); }
        c.drawPath(path,p); p.clearShadowLayer();
        p.setColor(Color.argb(85,255,255,255)); c.drawCircle(cx-rad*.22f,cy-rad*.25f,rad*.17f,p);
        if(r==selR && col==selC){ p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(dp(4)); p.setColor(Color.WHITE); c.drawCircle(cx,cy,rad*1.06f,p); p.setStyle(Paint.Style.FILL); }
    }

    private void drawFooter(Canvas c,int w,int h){
        float y=boardTop+cell*N+dp(36);
        text.setTextAlign(Paint.Align.CENTER); text.setTextSize(dp(14)); text.setColor(Color.rgb(205,219,241)); c.drawText("Swap adjacent pieces • match 3 or more",w/2f,y,text);
        drawButton(c,w*.30f,y+dp(48),dp(132),dp(44),"SHUFFLE");
        drawButton(c,w*.70f,y+dp(48),dp(132),dp(44),"RESTART");
        text.setTextSize(dp(11)); text.setColor(Color.rgb(135,155,187)); c.drawText("Progress is saved automatically",w/2f,h-dp(18),text);
    }

    private void drawButton(Canvas c,float x,float y,float bw,float bh,String s){
        p.setColor(Color.argb(170,126,87,194)); c.drawRoundRect(x-bw/2,y-bh/2,x+bw/2,y+bh/2,dp(16),dp(16),p);
        text.setColor(Color.WHITE); text.setTextSize(dp(13)); text.setTextAlign(Paint.Align.CENTER); c.drawText(s,x,y+dp(5),text);
    }

    private void drawBanner(Canvas c,int w,int h){
        p.setColor(Color.argb(225,14,24,42)); c.drawRoundRect(dp(28),h*.175f,w-dp(28),h*.225f,dp(18),dp(18),p);
        text.setColor(Color.WHITE); text.setTextSize(dp(14)); text.setTextAlign(Paint.Align.CENTER); c.drawText(banner,w/2f,h*.207f,text);
        postInvalidateDelayed(120);
    }

    private void drawOverlay(Canvas c,int w,int h){
        p.setColor(Color.argb(220,10,16,29)); c.drawRect(0,0,w,h,p);
        p.setColor(Color.rgb(38,55,84)); c.drawRoundRect(dp(32),h*.29f,w-dp(32),h*.71f,dp(28),dp(28),p);
        text.setTextAlign(Paint.Align.CENTER); text.setColor(Color.WHITE); text.setTextSize(dp(30)); c.drawText(won?"Garden Restored!":"So close!",w/2f,h*.38f,text);
        text.setTextSize(dp(15)); text.setColor(Color.rgb(207,219,240));
        c.drawText(won?"A new corner of the estate is blooming.":"Try again and create bigger cascades.",w/2f,h*.43f,text);
        text.setTextSize(dp(18)); text.setColor(won?Color.rgb(101,218,164):Color.rgb(255,181,71));
        c.drawText(won?"+100 coins":"Target: " + target,w/2f,h*.49f,text);
        drawButton(c,w/2f,h*.59f,dp(220),dp(56),won?"NEXT CHAPTER":"TRY AGAIN");
    }

    @Override public boolean onTouchEvent(MotionEvent e){
        if(e.getAction()!=MotionEvent.ACTION_UP) return true;
        float x=e.getX(), y=e.getY();
        if(levelOver){ if(y>getHeight()*.53f && y<getHeight()*.65f){ if(won) startLevel(level+1); else startLevel(level); } return true; }
        float footerY=boardTop+cell*N+dp(36)+dp(48);
        if(Math.abs(y-footerY)<dp(35)){
            if(x<getWidth()/2f){ shuffleBoard(); showBanner("Board shuffled ✨"); }
            else startLevel(level);
            return true;
        }
        int c=(int)((x-boardLeft)/cell), r=(int)((y-boardTop)/cell);
        if(r<0||r>=N||c<0||c>=N) return true;
        if(selR<0){ selR=r; selC=c; invalidate(); return true; }
        if(Math.abs(selR-r)+Math.abs(selC-c)==1){
            swap(selR,selC,r,c);
            if(hasAnyMatch()){
                moves--; vibrate(18); resolveCascades();
                if(score>=target){ won=true; levelOver=true; coins+=100; save(level+1); vibrate(60); }
                else if(moves<=0){ won=false; levelOver=true; save(level); }
            } else { swap(selR,selC,r,c); showBanner("That swap makes no match"); }
            selR=selC=-1; invalidate();
        } else { selR=r; selC=c; invalidate(); }
        return true;
    }

    private void resolveCascades(){
        int combo=0;
        while(true){
            boolean[][] mark=findMatches(); int count=0; for(int r=0;r<N;r++)for(int c=0;c<N;c++)if(mark[r][c])count++;
            if(count==0)break;
            combo++; score += count*55*combo;
            for(int c=0;c<N;c++){
                int write=N-1; for(int r=N-1;r>=0;r--) if(!mark[r][c]) board[write--][c]=board[r][c];
                while(write>=0) board[write--][c]=rng.nextInt(TYPES);
            }
        }
        if(combo>=2) showBanner("Cascade x"+combo+"!  +"+(combo*100)+" style bonus");
    }

    private boolean[][] findMatches(){
        boolean[][] m=new boolean[N][N];
        for(int r=0;r<N;r++){
            int s=0; for(int c=1;c<=N;c++) if(c==N||board[r][c]!=board[r][s]){ if(c-s>=3)for(int k=s;k<c;k++)m[r][k]=true; s=c; }
        }
        for(int c=0;c<N;c++){
            int s=0; for(int r=1;r<=N;r++) if(r==N||board[r][c]!=board[s][c]){ if(r-s>=3)for(int k=s;k<r;k++)m[k][c]=true; s=r; }
        }
        return m;
    }

    private boolean hasAnyMatch(){
        boolean[][] m=findMatches(); for(int r=0;r<N;r++)for(int c=0;c<N;c++)if(m[r][c])return true; return false;
    }
    private void swap(int r1,int c1,int r2,int c2){ int t=board[r1][c1]; board[r1][c1]=board[r2][c2]; board[r2][c2]=t; }
    private void shuffleBoard(){ do{ for(int r=0;r<N;r++)for(int c=0;c<N;c++)board[r][c]=rng.nextInt(TYPES); }while(hasAnyMatch()); invalidate(); }
    private void save(int unlocked){ prefs.edit().putInt("level",Math.max(level,unlocked)).putInt("coins",coins).apply(); }
    private void showBanner(String s){ banner=s; bannerUntil=System.currentTimeMillis()+1800; invalidate(); }
    private void vibrate(long ms){ try{ if(vibrator==null)return; if(android.os.Build.VERSION.SDK_INT>=26)vibrator.vibrate(VibrationEffect.createOneShot(ms,VibrationEffect.DEFAULT_AMPLITUDE)); else vibrator.vibrate(ms);}catch(Exception ignored){} }
    private float dp(float x){ return x*getResources().getDisplayMetrics().density; }
}
