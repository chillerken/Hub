package com.bloombeyond.game;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.*;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.MotionEvent;
import android.view.View;
import java.util.*;

public class GameView extends View {
    private static final int N=8,TYPES=6,HOME=0,MAP=1,GAME=2,STORY=3,RENOVATE=4,REWARDS=5,PETS=6;
    private final Paint p=new Paint(Paint.ANTI_ALIAS_FLAG), text=new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Random rng=new Random();
    private final SharedPreferences prefs;
    private final Vibrator vibrator;
    private final int[][] board=new int[N][N], power=new int[N][N], blocker=new int[N][N];
    private final ArrayList<Spark> sparks=new ArrayList<>();
    private int mode=HOME, level, unlocked, score, moves, target, coins, stars, renovationStep, storyIndex, rocketBoosters, bombBoosters, rainbowBoosters, wins, petIndex;
    private int selR=-1,selC=-1;
    private float boardLeft,boardTop,cell;
    private String banner=""; private long bannerUntil=0; private boolean levelOver=false,won=false;
    private final int[] colors={Color.rgb(244,91,132),Color.rgb(255,183,64),Color.rgb(84,205,151),Color.rgb(78,155,246),Color.rgb(161,103,238),Color.rgb(244,105,205)};
    private final String[] characters={"Maya","Theo","Nora","Felix","Ivy"};
    private final String[] dialogue={
        "Maya: This estate has been asleep for years. Let's wake it up.",
        "Theo: I found old plans behind the greenhouse wall.",
        "Nora: Restore the fountain and the whole garden will change.",
        "Felix: Someone sealed the west wing on purpose. Interesting...",
        "Ivy: Every room here remembers a story. Some are better left hidden."
    };

    public GameView(Context c){
        super(c); setLayerType(View.LAYER_TYPE_SOFTWARE,null);
        prefs=c.getSharedPreferences("bloom_save",Context.MODE_PRIVATE);
        vibrator=(Vibrator)c.getSystemService(Context.VIBRATOR_SERVICE);
        unlocked=Math.max(1,prefs.getInt("level",1)); level=unlocked; coins=prefs.getInt("coins",0); stars=prefs.getInt("stars",0);
        renovationStep=prefs.getInt("renovationStep",0); storyIndex=prefs.getInt("storyIndex",0); rocketBoosters=prefs.getInt("rocketBoosters",2); bombBoosters=prefs.getInt("bombBoosters",1); rainbowBoosters=prefs.getInt("rainbowBoosters",1); wins=prefs.getInt("wins",0); petIndex=prefs.getInt("petIndex",0);
        text.setTypeface(Typeface.create("sans",Typeface.BOLD)); startLevel(level,false);
    }

    private void startLevel(int l,boolean enterGame){
        level=Math.max(1,l); score=petIndex==1?50:0; moves=Math.max(18,30-(level/4))+(petIndex==0?1:0); target=700+(level-1)*170; levelOver=false;won=false;selR=selC=-1;
        for(int r=0;r<N;r++){Arrays.fill(power[r],0);Arrays.fill(blocker[r],0);} do{fillRandom();}while(hasAnyMatch()); seedObstacles();
        if(enterGame)mode=GAME; showBanner("Level "+level+"  •  Restore the estate"); invalidate();
    }

    private void seedObstacles(){int count=level<2?0:Math.min(12,2+level/2),guard=0;while(count>0&&guard++<300){int r=1+rng.nextInt(N-2),c=1+rng.nextInt(N-2);if(blocker[r][c]==0){blocker[r][c]=level>=7&&count%4==0?2:1;count--;}}}
    private void fillRandom(){for(int r=0;r<N;r++)for(int c=0;c<N;c++){int v;do{v=rng.nextInt(TYPES);}while((c>=2&&board[r][c-1]==v&&board[r][c-2]==v)||(r>=2&&board[r-1][c]==v&&board[r-2][c]==v));board[r][c]=v;}}

    @Override protected void onDraw(Canvas c){super.onDraw(c);int w=getWidth(),h=getHeight();drawBackground(c,w,h);if(mode==HOME)drawHome(c,w,h);else if(mode==MAP)drawMap(c,w,h);else if(mode==GAME)drawGame(c,w,h);else if(mode==STORY)drawStory(c,w,h);else if(mode==RENOVATE)drawRenovate(c,w,h);else if(mode==REWARDS)drawRewards(c,w,h);else drawPets(c,w,h);drawSparks(c);}

    private void drawBackground(Canvas c,int w,int h){LinearGradient g=new LinearGradient(0,0,w,h,Color.rgb(24,39,67),Color.rgb(18,25,43),Shader.TileMode.CLAMP);p.setShader(g);c.drawRect(0,0,w,h,p);p.setShader(null);long t=System.currentTimeMillis()/40;for(int i=0;i<18;i++){float x=(float)((i*109+t*(i%3+1))%(w+120))-60,y=(i*173)%Math.max(1,h);p.setColor(Color.argb(18+(i%4)*5,255,255,255));c.drawCircle(x,y,18+(i%5)*9,p);}postInvalidateDelayed(50);}
    private void title(Canvas c,int w,String sub){text.setTextAlign(Paint.Align.CENTER);text.setColor(Color.WHITE);text.setTextSize(dp(28));c.drawText("BLOOM & BEYOND",w/2f,dp(46),text);text.setTextSize(dp(12));text.setColor(Color.rgb(184,204,232));c.drawText(sub,w/2f,dp(68),text);}

    private void drawHome(Canvas c,int w,int h){
        title(c,w,"MATCH • RESTORE • DISCOVER");p.setColor(Color.argb(160,25,42,70));c.drawRoundRect(dp(24),h*.15f,w-dp(24),h*.70f,dp(30),dp(30),p);
        p.setColor(Color.rgb(68,119,91));c.drawRoundRect(dp(44),h*.22f,w-dp(44),h*.48f,dp(28),dp(28),p);p.setColor(Color.rgb(97,151,103));c.drawCircle(w*.30f,h*.35f,dp(56),p);c.drawCircle(w*.70f,h*.34f,dp(72),p);
        p.setColor(Color.rgb(224,203,164));c.drawRect(w*.40f,h*.29f,w*.60f,h*.48f,p);p.setColor(Color.rgb(88,61,76));Path roof=new Path();roof.moveTo(w*.37f,h*.29f);roof.lineTo(w*.5f,h*.22f);roof.lineTo(w*.63f,h*.29f);roof.close();c.drawPath(roof,p);
        text.setColor(Color.WHITE);text.setTextSize(dp(22));c.drawText("Your forgotten estate awaits",w/2f,h*.56f,text);text.setColor(Color.rgb(194,211,235));text.setTextSize(dp(13));c.drawText("Solve puzzles. Reveal secrets. Rebuild everything.",w/2f,h*.60f,text);
        drawButton(c,w/2f,h*.65f,dp(250),dp(58),"CONTINUE  •  LEVEL "+unlocked,true);drawButton(c,w*.25f,h*.76f,dp(110),dp(46),"MAP",false);drawButton(c,w*.50f,h*.76f,dp(110),dp(46),"RENOVATE",false);drawButton(c,w*.75f,h*.76f,dp(110),dp(46),"PETS",false);drawButton(c,w/2f,h*.84f,dp(230),dp(44),"DAILY REWARDS",false);
        text.setTextSize(dp(12));text.setColor(Color.rgb(173,196,225));c.drawText("Coins "+coins+"  •  Stars "+stars+"  •  Wins "+wins,w/2f,h*.91f,text);
    }

    private void drawMap(Canvas c,int w,int h){
        title(c,w,"THE EVERBLOOM ESTATE");text.setTextSize(dp(13));text.setColor(Color.rgb(184,204,232));c.drawText("Tap the glowing garden to play",w/2f,dp(92),text);p.setColor(Color.rgb(38,82,72));c.drawRoundRect(dp(22),dp(112),w-dp(22),h-dp(95),dp(30),dp(30),p);
        drawMapNode(c,w*.25f,h*.28f,dp(34),"MANOR",renovationStep>=2);drawMapNode(c,w*.68f,h*.31f,dp(42),"GARDEN",true);drawMapNode(c,w*.36f,h*.48f,dp(31),"GREENHOUSE",unlocked>=6);drawMapNode(c,w*.73f,h*.55f,dp(33),"FOUNTAIN",renovationStep>=4);drawMapNode(c,w*.30f,h*.68f,dp(34),"WEST WING",unlocked>=12);
        p.setStyle(Paint.Style.STROKE);p.setStrokeWidth(dp(4));p.setColor(Color.argb(130,220,238,214));Path route=new Path();route.moveTo(w*.25f,h*.28f);route.cubicTo(w*.45f,h*.20f,w*.52f,h*.36f,w*.68f,h*.31f);route.cubicTo(w*.58f,h*.42f,w*.46f,h*.42f,w*.36f,h*.48f);route.cubicTo(w*.50f,h*.57f,w*.60f,h*.48f,w*.73f,h*.55f);route.cubicTo(w*.56f,h*.70f,w*.43f,h*.61f,w*.30f,h*.68f);c.drawPath(route,p);p.setStyle(Paint.Style.FILL);
        drawButton(c,w*.30f,h-dp(52),dp(135),dp(46),"HOME",false);drawButton(c,w*.70f,h-dp(52),dp(135),dp(46),"PLAY",true);
    }
    private void drawMapNode(Canvas c,float x,float y,float rad,String label,boolean open){p.setShadowLayer(dp(8),0,dp(4),Color.argb(100,0,0,0));p.setColor(open?Color.rgb(246,190,77):Color.rgb(76,91,105));c.drawCircle(x,y,rad,p);p.clearShadowLayer();p.setColor(open?Color.rgb(255,227,146):Color.rgb(119,132,145));c.drawCircle(x-rad*.18f,y-rad*.18f,rad*.22f,p);text.setColor(open?Color.WHITE:Color.rgb(173,184,196));text.setTextSize(dp(10));c.drawText(label,x,y+rad+dp(18),text);}

    private void drawGame(Canvas c,int w,int h){drawHeader(c,w);cell=Math.min((w-36f)/N,(h*.58f)/N);boardLeft=(w-cell*N)/2f;boardTop=h*.235f;drawBoard(c);drawFooter(c,w,h);if(System.currentTimeMillis()<bannerUntil)drawBanner(c,w,h);if(levelOver)drawOverlay(c,w,h);}
    private void drawHeader(Canvas c,int w){title(c,w,"PUZZLE GARDEN");float y=dp(95);drawPill(c,w*.17f,y,"LEVEL",String.valueOf(level));drawPill(c,w*.50f,y,"MOVES",String.valueOf(moves));drawPill(c,w*.83f,y,"DEBRIS",String.valueOf(obstaclesLeft()));text.setTextSize(dp(13));text.setColor(Color.WHITE);c.drawText("Score "+score+" / "+target,w/2f,dp(145),text);p.setColor(Color.argb(65,255,255,255));c.drawRoundRect(w*.14f,dp(154),w*.86f,dp(164),dp(8),dp(8),p);float prog=Math.min(1f,score/(float)target);p.setColor(Color.rgb(101,218,164));c.drawRoundRect(w*.14f,dp(154),w*.14f+(w*.72f)*prog,dp(164),dp(8),dp(8),p);}
    private void drawPill(Canvas c,float x,float y,String lab,String val){float rw=dp(94),rh=dp(50);p.setColor(Color.argb(160,12,22,40));c.drawRoundRect(x-rw/2,y-rh/2,x+rw/2,y+rh/2,dp(16),dp(16),p);text.setTextAlign(Paint.Align.CENTER);text.setColor(Color.rgb(155,180,211));text.setTextSize(dp(9));c.drawText(lab,x,y-dp(4),text);text.setColor(Color.WHITE);text.setTextSize(dp(17));c.drawText(val,x,y+dp(16),text);}
    private void drawBoard(Canvas c){p.setColor(Color.argb(100,4,10,22));c.drawRoundRect(boardLeft-dp(8),boardTop-dp(8),boardLeft+cell*N+dp(8),boardTop+cell*N+dp(8),dp(22),dp(22),p);for(int r=0;r<N;r++)for(int col=0;col<N;col++)drawGem(c,r,col);}

    private void drawGem(Canvas c,int r,int col){
        float cx=boardLeft+col*cell+cell/2,cy=boardTop+r*cell+cell/2,rad=cell*.37f;p.setColor(Color.argb(38,255,255,255));c.drawCircle(cx,cy,rad*1.09f,p);p.setShadowLayer(dp(5),0,dp(3),Color.argb(100,0,0,0));p.setColor(colors[board[r][col]]);Path path=new Path();int type=board[r][col];
        if(type==0){path.moveTo(cx,cy-rad);path.cubicTo(cx+rad,cy-rad*.5f,cx+rad,cy+rad*.5f,cx,cy+rad);path.cubicTo(cx-rad,cy+rad*.5f,cx-rad,cy-rad*.5f,cx,cy-rad);}else if(type==1){for(int i=0;i<8;i++){double a=-Math.PI/2+i*Math.PI/4;float rr=i%2==0?rad:rad*.72f,x=cx+(float)Math.cos(a)*rr,y=cy+(float)Math.sin(a)*rr;if(i==0)path.moveTo(x,y);else path.lineTo(x,y);}path.close();}else if(type==2){path.addRoundRect(cx-rad,cy-rad,cx+rad,cy+rad,rad*.35f,rad*.35f,Path.Direction.CW);}else if(type==3){path.moveTo(cx,cy-rad);path.lineTo(cx+rad,cy);path.lineTo(cx,cy+rad);path.lineTo(cx-rad,cy);path.close();}else if(type==4){for(int i=0;i<6;i++){double a=-Math.PI/2+i*Math.PI/3;float x=cx+(float)Math.cos(a)*rad,y=cy+(float)Math.sin(a)*rad;if(i==0)path.moveTo(x,y);else path.lineTo(x,y);}path.close();}else path.addOval(cx-rad*.88f,cy-rad,cx+rad*.88f,cy+rad,Path.Direction.CW);
        c.drawPath(path,p);p.clearShadowLayer();p.setColor(Color.argb(95,255,255,255));c.drawCircle(cx-rad*.22f,cy-rad*.25f,rad*.16f,p);drawPower(c,r,col,cx,cy,rad);
        if(blocker[r][col]>0){p.setStyle(Paint.Style.STROKE);p.setStrokeWidth(dp(blocker[r][col]==2?5:3));p.setColor(blocker[r][col]==2?Color.rgb(126,86,57):Color.rgb(183,126,76));c.drawRoundRect(cx-rad*.90f,cy-rad*.90f,cx+rad*.90f,cy+rad*.90f,dp(8),dp(8),p);p.setStyle(Paint.Style.FILL);text.setTextSize(dp(9));text.setColor(Color.WHITE);c.drawText(blocker[r][col]==2?"2":"1",cx,cy+dp(3),text);}
        if(r==selR&&col==selC){p.setStyle(Paint.Style.STROKE);p.setStrokeWidth(dp(4));p.setColor(Color.WHITE);c.drawCircle(cx,cy,rad*1.10f,p);p.setStyle(Paint.Style.FILL);}
    }

    private void drawPower(Canvas c,int r,int col,float cx,float cy,float rad){int q=power[r][col];if(q==0)return;p.setColor(Color.WHITE);p.setStrokeWidth(dp(3));p.setStyle(Paint.Style.STROKE);if(q==1){c.drawLine(cx-rad*.62f,cy,cx+rad*.62f,cy,p);c.drawLine(cx-rad*.45f,cy-dp(5),cx-rad*.62f,cy,p);c.drawLine(cx-rad*.45f,cy+dp(5),cx-rad*.62f,cy,p);}else if(q==2){c.drawLine(cx,cy-rad*.62f,cx,cy+rad*.62f,p);c.drawLine(cx-dp(5),cy-rad*.45f,cx,cy-rad*.62f,p);c.drawLine(cx+dp(5),cy-rad*.45f,cx,cy-rad*.62f,p);}else if(q==3){c.drawCircle(cx,cy,rad*.48f,p);c.drawLine(cx+rad*.3f,cy-rad*.35f,cx+rad*.55f,cy-rad*.65f,p);}else for(int i=0;i<3;i++)c.drawCircle(cx,cy,rad*(.28f+i*.14f),p);p.setStyle(Paint.Style.FILL);}
    private void drawFooter(Canvas c,int w,int h){float y=boardTop+cell*N+dp(30);text.setTextAlign(Paint.Align.CENTER);text.setTextSize(dp(12));text.setColor(Color.rgb(205,219,241));c.drawText("Match 4 = rocket  •  Match 5 = rainbow  •  T/L = bomb",w/2f,y,text);drawButton(c,w*.18f,y+dp(44),dp(82),dp(40),"MAP",false);drawButton(c,w*.50f,y+dp(44),dp(82),dp(40),"SHUFFLE",false);drawButton(c,w*.82f,y+dp(44),dp(82),dp(40),"RESTART",false);drawButton(c,w*.22f,y+dp(91),dp(104),dp(38),"ROCKET "+rocketBoosters,false);drawButton(c,w*.50f,y+dp(91),dp(104),dp(38),"BOMB "+bombBoosters,false);drawButton(c,w*.78f,y+dp(91),dp(104),dp(38),"RAINBOW "+rainbowBoosters,false);}
    private void drawButton(Canvas c,float x,float y,float bw,float bh,String s,boolean primary){p.setShadowLayer(primary?dp(7):0,0,dp(3),Color.argb(100,0,0,0));p.setColor(primary?Color.rgb(143,94,220):Color.argb(190,48,70,105));c.drawRoundRect(x-bw/2,y-bh/2,x+bw/2,y+bh/2,dp(16),dp(16),p);p.clearShadowLayer();text.setColor(Color.WHITE);text.setTextSize(dp(12));text.setTextAlign(Paint.Align.CENTER);c.drawText(s,x,y+dp(4),text);}
    private void drawBanner(Canvas c,int w,int h){p.setColor(Color.argb(232,12,22,40));c.drawRoundRect(dp(28),h*.177f,w-dp(28),h*.222f,dp(18),dp(18),p);text.setColor(Color.WHITE);text.setTextSize(dp(13));text.setTextAlign(Paint.Align.CENTER);c.drawText(banner,w/2f,h*.207f,text);}
    private void drawOverlay(Canvas c,int w,int h){p.setColor(Color.argb(225,8,14,26));c.drawRect(0,0,w,h,p);p.setColor(Color.rgb(38,55,84));c.drawRoundRect(dp(30),h*.27f,w-dp(30),h*.73f,dp(28),dp(28),p);text.setTextAlign(Paint.Align.CENTER);text.setColor(Color.WHITE);text.setTextSize(dp(29));c.drawText(won?"Chapter Complete!":"Almost there",w/2f,h*.37f,text);text.setTextSize(dp(14));text.setColor(Color.rgb(207,219,240));c.drawText(won?"You earned a renovation star.":"Clear every debris tile and reach the score.",w/2f,h*.42f,text);text.setTextSize(dp(18));text.setColor(won?Color.rgb(101,218,164):Color.rgb(255,181,71));c.drawText(won?"+100 coins    +1 star":"Debris "+obstaclesLeft()+"   Score "+score+"/"+target,w/2f,h*.49f,text);drawButton(c,w/2f,h*.59f,dp(230),dp(56),won?"CONTINUE STORY":"TRY AGAIN",true);drawButton(c,w/2f,h*.67f,dp(180),dp(42),"ESTATE MAP",false);}

    private void drawStory(Canvas c,int w,int h){title(c,w,"STORY CHAPTER");int idx=Math.min(dialogue.length-1,storyIndex%dialogue.length);float cx=w/2f,cy=h*.34f;p.setColor(colors[idx%colors.length]);c.drawCircle(cx,cy,dp(76),p);p.setColor(Color.rgb(246,217,184));c.drawCircle(cx,cy-dp(10),dp(44),p);p.setColor(Color.rgb(60,43,50));c.drawArc(cx-dp(46),cy-dp(58),cx+dp(46),cy+dp(18),190,160,true,p);text.setTextSize(dp(17));text.setColor(Color.WHITE);c.drawText(characters[idx],cx,cy+dp(98),text);p.setColor(Color.argb(190,20,34,58));c.drawRoundRect(dp(28),h*.52f,w-dp(28),h*.72f,dp(22),dp(22),p);text.setTextSize(dp(14));text.setColor(Color.rgb(229,236,247));wrapText(c,dialogue[idx],w/2f,h*.59f,w-dp(90),dp(24));drawButton(c,w/2f,h*.80f,dp(245),dp(56),stars>0?"RENOVATE ESTATE":"BACK TO MAP",true);}
    private void drawRenovate(Canvas c,int w,int h){title(c,w,"RENOVATION STUDIO");text.setTextSize(dp(13));text.setColor(Color.rgb(191,211,235));c.drawText("Stars "+stars+"  •  Progress "+renovationStep+"/8",w/2f,dp(96),text);p.setColor(Color.rgb(49,83,75));c.drawRoundRect(dp(28),dp(120),w-dp(28),h*.50f,dp(28),dp(28),p);float houseL=w*.30f,houseR=w*.70f,top=h*.22f,bottom=h*.48f;p.setColor(renovationStep>=1?Color.rgb(232,214,180):Color.rgb(137,126,112));c.drawRect(houseL,top,houseR,bottom,p);p.setColor(renovationStep>=2?Color.rgb(97,61,79):Color.rgb(91,79,78));Path roof=new Path();roof.moveTo(houseL-dp(16),top);roof.lineTo(w*.5f,top-dp(68));roof.lineTo(houseR+dp(16),top);roof.close();c.drawPath(roof,p);p.setColor(renovationStep>=3?Color.rgb(112,180,225):Color.rgb(75,92,102));c.drawRect(w*.39f,top+dp(50),w*.47f,top+dp(108),p);c.drawRect(w*.54f,top+dp(50),w*.62f,top+dp(108),p);p.setColor(renovationStep>=4?Color.rgb(96,170,110):Color.rgb(75,92,76));c.drawCircle(w*.25f,bottom-dp(5),dp(42),p);c.drawCircle(w*.76f,bottom-dp(10),dp(50),p);String task=renovationStep<8?renovationTask(renovationStep):"Estate garden restored — new wing coming soon";text.setTextSize(dp(18));text.setColor(Color.WHITE);c.drawText(task,w/2f,h*.58f,text);text.setTextSize(dp(12));text.setColor(Color.rgb(187,204,228));c.drawText(renovationStep<8?"Choose one of three styles. Cost: 1 star":"All current renovation tasks complete",w/2f,h*.62f,text);if(renovationStep<8){drawStyleCard(c,w*.22f,h*.71f,"MODERN",0);drawStyleCard(c,w*.50f,h*.71f,"CLASSIC",1);drawStyleCard(c,w*.78f,h*.71f,"LUXE",2);}drawButton(c,w*.30f,h*.88f,dp(135),dp(44),"MAP",false);drawButton(c,w*.70f,h*.88f,dp(135),dp(44),"PLAY",true);}
    private String renovationTask(int s){String[] tasks={"Restore entrance","Repair the roof","Replace windows","Revive the garden","Build the fountain","Open greenhouse","Light the courtyard","Reveal the west gate"};return tasks[Math.min(s,tasks.length-1)];}
    private void drawStyleCard(Canvas c,float x,float y,String label,int style){p.setColor(style==0?Color.rgb(69,118,146):(style==1?Color.rgb(118,90,130):Color.rgb(151,111,55)));c.drawRoundRect(x-dp(50),y-dp(45),x+dp(50),y+dp(45),dp(17),dp(17),p);p.setColor(Color.argb(90,255,255,255));c.drawCircle(x,y-dp(10),dp(18),p);text.setTextSize(dp(10));text.setColor(Color.WHITE);c.drawText(label,x,y+dp(28),text);}
    private void wrapText(Canvas c,String s,float cx,float y,float maxWidth,float lineH){String[] words=s.split(" ");String line="";int ln=0;for(String word:words){String test=line.length()==0?word:line+" "+word;if(text.measureText(test)>maxWidth&&line.length()>0){c.drawText(line,cx,y+ln*lineH,text);ln++;line=word;}else line=test;}if(line.length()>0)c.drawText(line,cx,y+ln*lineH,text);}

    @Override public boolean onTouchEvent(MotionEvent e){
        if(e.getAction()!=MotionEvent.ACTION_UP)return true;float x=e.getX(),y=e.getY();int w=getWidth(),h=getHeight();
        if(mode==HOME){if(y>h*.60f&&y<h*.70f)startLevel(unlocked,true);else if(y>h*.72f&&y<h*.80f){if(x<w*.38f)mode=MAP;else if(x<w*.63f)mode=RENOVATE;else mode=PETS;invalidate();}else if(y>h*.80f&&y<h*.88f){mode=REWARDS;invalidate();}return true;}
        if(mode==MAP){if(y>h-dp(82)){if(x<w/2f)mode=HOME;else startLevel(unlocked,true);invalidate();return true;}if(x>w*.52f&&x<w*.84f&&y>h*.22f&&y<h*.40f){startLevel(unlocked,true);return true;}return true;}
        if(mode==STORY){if(y>h*.74f&&y<h*.85f){mode=stars>0?RENOVATE:MAP;invalidate();}return true;}
        if(mode==REWARDS){long day=System.currentTimeMillis()/86400000L;long last=prefs.getLong("dailyDay",-1);if(y>h*.68f&&y<h*.77f&&day!=last){coins+=100;rocketBoosters++;prefs.edit().putLong("dailyDay",day).apply();saveProgress();vibrate(35);invalidate();}else if(y>h*.78f&&y<h*.87f){mode=HOME;invalidate();}return true;}
        if(mode==PETS){if(y>h*.20f&&y<h*.66f){int col=x<w/2f?0:1,row=y<h*.42f?0:1;petIndex=row*2+col;saveProgress();vibrate(20);invalidate();}else if(y>h*.80f){mode=HOME;invalidate();}return true;}
        if(mode==RENOVATE){if(y>h*.65f&&y<h*.77f&&renovationStep<8){if(stars<=0){showBanner("Earn a star by completing a puzzle");return true;}int style=x<w*.36f?0:(x<w*.64f?1:2);prefs.edit().putInt("style_"+renovationStep,style).apply();stars--;renovationStep++;saveProgress();vibrate(45);invalidate();return true;}if(y>h*.84f){if(x<w/2f)mode=MAP;else startLevel(unlocked,true);invalidate();}return true;}
        if(levelOver){if(y>h*.53f&&y<h*.63f){if(won){storyIndex++;prefs.edit().putInt("storyIndex",storyIndex).apply();mode=STORY;}else startLevel(level,true);invalidate();}else if(y>h*.63f&&y<h*.72f){mode=MAP;invalidate();}return true;}
        float footerY=boardTop+cell*N+dp(74);if(Math.abs(y-footerY)<dp(30)){if(x<w*.34f){mode=MAP;invalidate();}else if(x<w*.66f){shuffleBoard();moves=Math.max(0,moves-1);showBanner("Board shuffled  •  -1 move");}else startLevel(level,true);return true;}if(Math.abs(y-(footerY+dp(47)))<dp(24)){if(x<w*.36f)useBooster(1);else if(x<w*.64f)useBooster(3);else useBooster(4);return true;}
        int c=(int)((x-boardLeft)/cell),r=(int)((y-boardTop)/cell);if(r<0||r>=N||c<0||c>=N)return true;if(selR<0){selR=r;selC=c;invalidate();return true;}
        if(Math.abs(selR-r)+Math.abs(selC-c)==1){int r1=selR,c1=selC,r2=r,c2=c;boolean specialSwap=power[r1][c1]>0&&power[r2][c2]>0;swapAll(r1,c1,r2,c2);boolean rainbowSwap=power[r2][c2]==4||power[r1][c1]==4;if(specialSwap){moves--;activateCombo(r1,c1,r2,c2);resolveCascades(-1,-1);afterMove();}else if(rainbowSwap){moves--;activateRainbowSwap(r1,c1,r2,c2);resolveCascades(-1,-1);afterMove();}else if(hasAnyMatch()){moves--;vibrate(18);resolveCascades(r2,c2);afterMove();}else{swapAll(r1,c1,r2,c2);showBanner("That swap makes no match");}selR=selC=-1;invalidate();}else{selR=r;selC=c;invalidate();}return true;
    }

    private void afterMove(){if(score>=target&&obstaclesLeft()==0){won=true;levelOver=true;coins+=100;stars++;wins++;unlocked=Math.max(unlocked,level+1);if(wins%3==0)rocketBoosters++;if(wins%5==0)bombBoosters++;if(wins%7==0)rainbowBoosters++;saveProgress();vibrate(70);}else if(moves<=0){won=false;levelOver=true;saveProgress();}}
    private void resolveCascades(int preferredR,int preferredC){int combo=0;boolean first=true;while(true){boolean[][] mark=findMatches();int count=countMarks(mark);if(count==0)break;combo++;int cr=-1,cc=-1,np=0;if(first){int[] s=detectSpecial(mark,preferredR,preferredC);cr=s[0];cc=s[1];np=s[2];}expandPowerEffects(mark);count=countMarks(mark);score+=count*48*combo;for(int r=0;r<N;r++)for(int c=0;c<N;c++)if(mark[r][c]){addSpark(r,c);if(blocker[r][c]>0){blocker[r][c]--;if(blocker[r][c]>0)mark[r][c]=false;}}if(cr>=0&&blocker[cr][cc]==0){mark[cr][cc]=false;power[cr][cc]=np;}clearAndDrop(mark);first=false;}if(combo>=3)showBanner("MEGA CASCADE x"+combo+"!");else if(combo>=2)showBanner("Cascade x"+combo+"!");}
    private int[] detectSpecial(boolean[][] mark,int pr,int pc){if(pr<0||pc<0||!mark[pr][pc]){outer:for(int r=0;r<N;r++)for(int c=0;c<N;c++)if(mark[r][c]){pr=r;pc=c;break outer;}}if(pr<0)return new int[]{-1,-1,0};int color=board[pr][pc],h=1,v=1;for(int c=pc-1;c>=0&&board[pr][c]==color;c--)h++;for(int c=pc+1;c<N&&board[pr][c]==color;c++)h++;for(int r=pr-1;r>=0&&board[r][pc]==color;r--)v++;for(int r=pr+1;r<N&&board[r][pc]==color;r++)v++;if(h>=5||v>=5)return new int[]{pr,pc,4};if(h>=3&&v>=3)return new int[]{pr,pc,3};if(h>=4)return new int[]{pr,pc,1};if(v>=4)return new int[]{pr,pc,2};return new int[]{-1,-1,0};}
    private void expandPowerEffects(boolean[][] mark){boolean changed=true;int guard=0;while(changed&&guard++<8){changed=false;for(int r=0;r<N;r++)for(int c=0;c<N;c++)if(mark[r][c]&&power[r][c]>0){int q=power[r][c];power[r][c]=0;changed=true;if(q==1)for(int x=0;x<N;x++)mark[r][x]=true;else if(q==2)for(int yy=0;yy<N;yy++)mark[yy][c]=true;else if(q==3)for(int yy=Math.max(0,r-1);yy<=Math.min(N-1,r+1);yy++)for(int x=Math.max(0,c-1);x<=Math.min(N-1,c+1);x++)mark[yy][x]=true;else{int col=board[r][c];for(int yy=0;yy<N;yy++)for(int x=0;x<N;x++)if(board[yy][x]==col)mark[yy][x]=true;}}}}
    private void activateCombo(int r1,int c1,int r2,int c2){int a=power[r1][c1],b=power[r2][c2];boolean[][] m=new boolean[N][N];m[r1][c1]=m[r2][c2]=true;if(a==4&&b==4){for(int r=0;r<N;r++)Arrays.fill(m[r],true);showBanner("RAINBOW NOVA!");}else if(a==4||b==4){int other=a==4?b:a;for(int r=0;r<N;r++)for(int c=0;c<N;c++){if(other==1||other==2){if((r+c)%3==0)m[r][c]=true;}else if(other==3&&((r+c)%2==0))m[r][c]=true;}showBanner("SUPER COLOR COMBO!");}else if(a==3||b==3){for(int r=Math.max(0,r2-2);r<=Math.min(N-1,r2+2);r++)for(int c=Math.max(0,c2-2);c<=Math.min(N-1,c2+2);c++)m[r][c]=true;showBanner("MEGA BOMB!");}else{for(int i=0;i<N;i++){m[r2][i]=true;m[i][c2]=true;}showBanner("CROSS ROCKET!");}power[r1][c1]=power[r2][c2]=0;expandPowerEffects(m);score+=countMarks(m)*75;damageAndDrop(m);vibrate(55);}
    private void activateRainbowSwap(int r1,int c1,int r2,int c2){int rr=power[r1][c1]==4?r1:r2,rc=power[r1][c1]==4?c1:c2,or=rr==r1?r2:r1,oc=rc==c1?c2:c1,color=board[or][oc];boolean[][] m=new boolean[N][N];for(int r=0;r<N;r++)for(int c=0;c<N;c++)if(board[r][c]==color)m[r][c]=true;m[rr][rc]=true;power[rr][rc]=0;score+=countMarks(m)*65;damageAndDrop(m);showBanner("RAINBOW CLEAR!");vibrate(45);}
    private void damageAndDrop(boolean[][] m){for(int r=0;r<N;r++)for(int c=0;c<N;c++)if(m[r][c]){addSpark(r,c);if(blocker[r][c]>0){blocker[r][c]--;if(blocker[r][c]>0)m[r][c]=false;}}clearAndDrop(m);}
    private void clearAndDrop(boolean[][] mark){for(int c=0;c<N;c++){int write=N-1;for(int r=N-1;r>=0;r--)if(!mark[r][c]){board[write][c]=board[r][c];power[write][c]=power[r][c];blocker[write][c]=blocker[r][c];write--;}while(write>=0){board[write][c]=rng.nextInt(TYPES);power[write][c]=0;blocker[write][c]=0;write--;}}}
    private boolean[][] findMatches(){boolean[][] m=new boolean[N][N];for(int r=0;r<N;r++){int s=0;for(int c=1;c<=N;c++)if(c==N||board[r][c]!=board[r][s]){if(c-s>=3)for(int k=s;k<c;k++)m[r][k]=true;s=c;}}for(int c=0;c<N;c++){int s=0;for(int r=1;r<=N;r++)if(r==N||board[r][c]!=board[s][c]){if(r-s>=3)for(int k=s;k<r;k++)m[k][c]=true;s=r;}}return m;}
    private int countMarks(boolean[][] m){int n=0;for(int r=0;r<N;r++)for(int c=0;c<N;c++)if(m[r][c])n++;return n;} private boolean hasAnyMatch(){return countMarks(findMatches())>0;} private int obstaclesLeft(){int n=0;for(int r=0;r<N;r++)for(int c=0;c<N;c++)if(blocker[r][c]>0)n++;return n;}
    private void swapAll(int r1,int c1,int r2,int c2){int t=board[r1][c1];board[r1][c1]=board[r2][c2];board[r2][c2]=t;t=power[r1][c1];power[r1][c1]=power[r2][c2];power[r2][c2]=t;t=blocker[r1][c1];blocker[r1][c1]=blocker[r2][c2];blocker[r2][c2]=t;}
    private void shuffleBoard(){do{for(int r=0;r<N;r++)for(int c=0;c<N;c++){board[r][c]=rng.nextInt(TYPES);power[r][c]=0;}}while(hasAnyMatch());invalidate();}
    private void saveProgress(){prefs.edit().putInt("level",unlocked).putInt("coins",coins).putInt("stars",stars).putInt("renovationStep",renovationStep).putInt("storyIndex",storyIndex).putInt("rocketBoosters",rocketBoosters).putInt("bombBoosters",bombBoosters).putInt("rainbowBoosters",rainbowBoosters).putInt("wins",wins).putInt("petIndex",petIndex).apply();}

    private void useBooster(int kind){
        int count=kind==1?rocketBoosters:(kind==3?bombBoosters:rainbowBoosters);
        if(count<=0){showBanner("No boosters left — win levels to earn more");return;}
        int r=rng.nextInt(N),c=rng.nextInt(N);power[r][c]=kind;
        if(kind==1)rocketBoosters--;else if(kind==3)bombBoosters--;else rainbowBoosters--;
        saveProgress();showBanner(kind==1?"Rocket placed!":(kind==3?"Bomb placed!":"Rainbow placed!"));vibrate(28);invalidate();
    }

    private void drawRewards(Canvas c,int w,int h){
        title(c,w,"DAILY REWARDS");
        text.setTextSize(dp(14));text.setColor(Color.rgb(190,211,236));c.drawText("Return each day for free progression rewards",w/2f,dp(102),text);
        long day=System.currentTimeMillis()/86400000L;long last=prefs.getLong("dailyDay",-1);boolean can=day!=last;
        for(int i=0;i<7;i++){float x=w*.16f+(i%4)*w*.225f,y=h*.28f+(i/4)*h*.20f;p.setColor(i==0&&can?Color.rgb(147,98,222):Color.rgb(47,67,99));c.drawRoundRect(x-dp(38),y-dp(43),x+dp(38),y+dp(43),dp(16),dp(16),p);text.setTextSize(dp(12));text.setColor(Color.WHITE);c.drawText("DAY "+(i+1),x,y-dp(14),text);text.setTextSize(dp(18));c.drawText(i==6?"★":"+"+(100+i*50),x,y+dp(12),text);}
        drawButton(c,w/2f,h*.72f,dp(250),dp(56),can?"CLAIM TODAY  •  +100 COINS":"CLAIMED TODAY",can);
        drawButton(c,w/2f,h*.82f,dp(180),dp(44),"HOME",false);
    }

    private void drawPets(Canvas c,int w,int h){
        title(c,w,"ESTATE PETS");
        String[] names={"Milo the Dog","Luna the Cat","Pip the Parrot","Clover the Rabbit"};
        int[] pc={Color.rgb(201,151,97),Color.rgb(130,145,165),Color.rgb(70,181,134),Color.rgb(230,210,190)};
        text.setTextSize(dp(13));text.setColor(Color.rgb(190,211,236));c.drawText("Your companion grants a small level-start bonus",w/2f,dp(100),text);
        for(int i=0;i<4;i++){float x=w*.28f+(i%2)*w*.44f,y=h*.30f+(i/2)*h*.24f;boolean sel=i==petIndex;p.setColor(sel?Color.rgb(146,98,221):Color.rgb(45,65,95));c.drawRoundRect(x-dp(72),y-dp(82),x+dp(72),y+dp(82),dp(22),dp(22),p);p.setColor(pc[i]);c.drawCircle(x,y-dp(18),dp(42),p);p.setColor(Color.BLACK);c.drawCircle(x-dp(13),y-dp(26),dp(4),p);c.drawCircle(x+dp(13),y-dp(26),dp(4),p);text.setColor(Color.WHITE);text.setTextSize(dp(12));c.drawText(names[i],x,y+dp(48),text);text.setTextSize(dp(10));text.setColor(Color.rgb(210,222,240));c.drawText(i==0?"+1 move":i==1?"+50 score":i==2?"+1 rocket chance":"+75 coins / 3 wins",x,y+dp(67),text);}
        drawButton(c,w/2f,h*.84f,dp(180),dp(44),"HOME",false);
    }

    private void showBanner(String s){banner=s;bannerUntil=System.currentTimeMillis()+1800;invalidate();}
    private void vibrate(long ms){try{if(vibrator==null)return;if(android.os.Build.VERSION.SDK_INT>=26)vibrator.vibrate(VibrationEffect.createOneShot(ms,VibrationEffect.DEFAULT_AMPLITUDE));else vibrator.vibrate(ms);}catch(Exception ignored){}}
    private float dp(float x){return x*getResources().getDisplayMetrics().density;}
    private void addSpark(int r,int c){if(cell<=0)return;float x=boardLeft+c*cell+cell/2,y=boardTop+r*cell+cell/2;for(int i=0;i<3;i++)sparks.add(new Spark(x,y,(rng.nextFloat()-.5f)*6,(rng.nextFloat()-.5f)*6,System.currentTimeMillis()));}
    private void drawSparks(Canvas c){long now=System.currentTimeMillis();Iterator<Spark> it=sparks.iterator();while(it.hasNext()){Spark s=it.next();float age=(now-s.birth)/450f;if(age>=1){it.remove();continue;}p.setColor(Color.argb((int)(180*(1-age)),255,235,180));c.drawCircle(s.x+s.vx*age*22,s.y+s.vy*age*22,dp(3)*(1-age*.5f),p);}}
    private static class Spark{float x,y,vx,vy;long birth;Spark(float x,float y,float vx,float vy,long b){this.x=x;this.y=y;this.vx=vx;this.vy=vy;this.birth=b;}}
}
