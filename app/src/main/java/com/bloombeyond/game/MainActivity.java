package com.bloombeyond.game;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

public class MainActivity extends Activity {
    private FrameLayout root;
    private Estate3DView estate;
    private boolean inPuzzle=false;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN, WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY|View.SYSTEM_UI_FLAG_FULLSCREEN|View.SYSTEM_UI_FLAG_HIDE_NAVIGATION);
        showEstate();
    }

    private void showEstate(){
        inPuzzle=false;
        root=new FrameLayout(this); estate=new Estate3DView(this); root.addView(estate,new FrameLayout.LayoutParams(-1,-1));

        LinearLayout heading=new LinearLayout(this);heading.setOrientation(LinearLayout.VERTICAL);heading.setGravity(Gravity.CENTER);heading.setPadding(dp(10),dp(8),dp(10),dp(8));heading.setBackground(panel(0xB0152237,18));
        TextView title=new TextView(this);title.setText("BLOOM & BEYOND");title.setTextColor(Color.WHITE);title.setTextSize(21);title.setGravity(Gravity.CENTER);title.setTypeface(null,1);
        TextView subtitle=new TextView(this);subtitle.setText("EVERBLOOM ESTATE • PREMIUM 3D EXPERIENCE");subtitle.setTextColor(0xFFDDE8F4);subtitle.setTextSize(10);subtitle.setGravity(Gravity.CENTER);
        heading.addView(title);heading.addView(subtitle);
        FrameLayout.LayoutParams hp=new FrameLayout.LayoutParams(-1,dp(68));hp.gravity=Gravity.TOP;hp.setMargins(dp(12),dp(10),dp(12),0);root.addView(heading,hp);

        LinearLayout top=new LinearLayout(this);top.setOrientation(LinearLayout.HORIZONTAL);top.setGravity(Gravity.CENTER);
        Button puzzle=button("PLAY PUZZLES");Button day=button("NIGHT");Button rain=button("RAIN");top.addView(puzzle,weight());top.addView(day,weight());top.addView(rain,weight());
        FrameLayout.LayoutParams topP=new FrameLayout.LayoutParams(-1,dp(50));topP.gravity=Gravity.TOP;topP.setMargins(dp(8),dp(86),dp(8),0);root.addView(top,topP);
        puzzle.setOnClickListener(v->showPuzzles());
        day.setOnClickListener(v->{estate.toggleDayNight();day.setText(estate.isNight()?"DAY":"NIGHT");});
        rain.setOnClickListener(v->{estate.toggleRain();rain.setText(estate.isRaining()?"CLEAR":"RAIN");});

        TextView objective=new TextView(this);objective.setText("EXPLORE • Walk toward the manor, inspect the fountain, then continue the story through a puzzle.");objective.setTextColor(Color.WHITE);objective.setTextSize(11);objective.setGravity(Gravity.CENTER);objective.setPadding(dp(12),0,dp(12),0);objective.setBackground(panel(0xA6152338,15));
        FrameLayout.LayoutParams op=new FrameLayout.LayoutParams(-1,dp(46));op.gravity=Gravity.BOTTOM;op.setMargins(dp(16),0,dp(16),dp(145));root.addView(objective,op);

        LinearLayout controls=new LinearLayout(this);controls.setOrientation(LinearLayout.VERTICAL);controls.setGravity(Gravity.CENTER);
        Button forward=button("▲");controls.addView(forward,new LinearLayout.LayoutParams(dp(66),dp(50)));
        LinearLayout row=new LinearLayout(this);row.setGravity(Gravity.CENTER);Button left=button("◀");Button back=button("▼");Button right=button("▶");row.addView(left,new LinearLayout.LayoutParams(dp(66),dp(50)));row.addView(back,new LinearLayout.LayoutParams(dp(66),dp(50)));row.addView(right,new LinearLayout.LayoutParams(dp(66),dp(50)));controls.addView(row);
        forward.setOnClickListener(v->estate.moveForward());back.setOnClickListener(v->estate.moveBackward());left.setOnClickListener(v->estate.strafeLeft());right.setOnClickListener(v->estate.strafeRight());
        FrameLayout.LayoutParams cp=new FrameLayout.LayoutParams(dp(210),dp(108));cp.gravity=Gravity.BOTTOM|Gravity.LEFT;cp.setMargins(dp(12),0,0,dp(18));root.addView(controls,cp);

        TextView hint=new TextView(this);hint.setText("Drag anywhere to look around\nUse arrows to move");hint.setTextColor(0xFFEAF1F8);hint.setTextSize(11);hint.setGravity(Gravity.CENTER);hint.setBackground(panel(0x8F152337,14));
        FrameLayout.LayoutParams hintP=new FrameLayout.LayoutParams(dp(150),dp(72));hintP.gravity=Gravity.BOTTOM|Gravity.RIGHT;hintP.setMargins(0,0,dp(16),dp(32));root.addView(hint,hintP);
        setContentView(root);
    }

    private void showPuzzles(){
        inPuzzle=true;
        GameView game=new GameView(this);root.removeAllViews();root.addView(game,new FrameLayout.LayoutParams(-1,-1));
        Button back=button("3D ESTATE");FrameLayout.LayoutParams bp=new FrameLayout.LayoutParams(dp(126),dp(44));bp.gravity=Gravity.TOP|Gravity.LEFT;bp.setMargins(dp(10),dp(10),0,0);root.addView(back,bp);back.setOnClickListener(v->showEstate());
    }

    private Button button(String s){Button b=new Button(this);b.setText(s);b.setTextColor(Color.WHITE);b.setTextSize(11);b.setAllCaps(false);b.setGravity(Gravity.CENTER);b.setPadding(dp(4),0,dp(4),0);b.setBackground(panel(0xD34C3B78,16));return b;}
    private LinearLayout.LayoutParams weight(){LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(0,-1,1);p.setMargins(dp(3),0,dp(3),0);return p;}
    private GradientDrawable panel(int color,int radius){GradientDrawable g=new GradientDrawable();g.setColor(color);g.setCornerRadius(dp(radius));g.setStroke(dp(1),0x55FFFFFF);return g;}
    private int dp(int x){return Math.round(x*getResources().getDisplayMetrics().density);}

    @Override public void onBackPressed(){if(inPuzzle)showEstate();else super.onBackPressed();}
    @Override protected void onPause(){super.onPause();if(!inPuzzle&&estate!=null)estate.onPause();}
    @Override protected void onResume(){super.onResume();if(!inPuzzle&&estate!=null)estate.onResume();}
}
