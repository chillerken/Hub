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

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN, WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY|View.SYSTEM_UI_FLAG_FULLSCREEN|View.SYSTEM_UI_FLAG_HIDE_NAVIGATION);
        showEstate();
    }

    private void showEstate(){
        root=new FrameLayout(this); estate=new Estate3DView(this); root.addView(estate,new FrameLayout.LayoutParams(-1,-1));

        TextView title=new TextView(this); title.setText("BLOOM & BEYOND\nEVERBLOOM ESTATE • 3D EXPERIENCE"); title.setTextColor(Color.WHITE); title.setTextSize(18); title.setGravity(Gravity.CENTER); title.setPadding(dp(14),dp(10),dp(14),dp(10)); title.setBackground(panel(0xA6192639,18));
        FrameLayout.LayoutParams tp=new FrameLayout.LayoutParams(-1,dp(70)); tp.gravity=Gravity.TOP; tp.setMargins(dp(12),dp(12),dp(12),0); root.addView(title,tp);

        LinearLayout top=new LinearLayout(this); top.setOrientation(LinearLayout.HORIZONTAL); top.setGravity(Gravity.CENTER); top.setPadding(dp(4),dp(4),dp(4),dp(4));
        Button puzzle=button("PLAY PUZZLES"); Button day=button("DAY / NIGHT"); Button rain=button("RAIN"); top.addView(puzzle,weight()); top.addView(day,weight()); top.addView(rain,weight());
        FrameLayout.LayoutParams topP=new FrameLayout.LayoutParams(-1,dp(58)); topP.gravity=Gravity.TOP; topP.setMargins(dp(8),dp(90),dp(8),0); root.addView(top,topP);
        puzzle.setOnClickListener(v->showPuzzles()); day.setOnClickListener(v->estate.toggleDayNight()); rain.setOnClickListener(v->estate.toggleRain());

        TextView hint=new TextView(this); hint.setText("Drag to look around • Use controls to explore the manor, greenhouse and fountain"); hint.setTextColor(0xFFE7EEF8); hint.setTextSize(12); hint.setGravity(Gravity.CENTER); hint.setBackground(panel(0x8F152337,14));
        FrameLayout.LayoutParams hp=new FrameLayout.LayoutParams(-1,dp(44)); hp.gravity=Gravity.BOTTOM; hp.setMargins(dp(18),0,dp(18),dp(138)); root.addView(hint,hp);

        LinearLayout controls=new LinearLayout(this); controls.setOrientation(LinearLayout.VERTICAL); controls.setGravity(Gravity.CENTER); controls.setPadding(dp(8),dp(4),dp(8),dp(4));
        Button forward=button("▲ FORWARD"); controls.addView(forward,new LinearLayout.LayoutParams(dp(150),dp(48)));
        LinearLayout row=new LinearLayout(this); row.setGravity(Gravity.CENTER); Button left=button("◀ LEFT"); Button back=button("▼ BACK"); Button right=button("RIGHT ▶"); row.addView(left,new LinearLayout.LayoutParams(dp(112),dp(48))); row.addView(back,new LinearLayout.LayoutParams(dp(112),dp(48))); row.addView(right,new LinearLayout.LayoutParams(dp(112),dp(48))); controls.addView(row);
        forward.setOnClickListener(v->estate.moveForward()); back.setOnClickListener(v->estate.moveBackward()); left.setOnClickListener(v->estate.strafeLeft()); right.setOnClickListener(v->estate.strafeRight());
        FrameLayout.LayoutParams cp=new FrameLayout.LayoutParams(-1,dp(108)); cp.gravity=Gravity.BOTTOM; cp.setMargins(0,0,0,dp(18)); root.addView(controls,cp);
        setContentView(root);
    }

    private void showPuzzles(){
        GameView game=new GameView(this);
        root.removeAllViews(); root.addView(game,new FrameLayout.LayoutParams(-1,-1));
        Button back=button("3D ESTATE"); FrameLayout.LayoutParams bp=new FrameLayout.LayoutParams(dp(130),dp(46)); bp.gravity=Gravity.TOP|Gravity.LEFT; bp.setMargins(dp(10),dp(10),0,0); root.addView(back,bp); back.setOnClickListener(v->showEstate());
    }

    private Button button(String s){Button b=new Button(this);b.setText(s);b.setTextColor(Color.WHITE);b.setTextSize(10);b.setAllCaps(false);b.setGravity(Gravity.CENTER);b.setPadding(dp(4),0,dp(4),0);b.setBackground(panel(0xD14A3A73,16));return b;}
    private LinearLayout.LayoutParams weight(){LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(0,-1,1);p.setMargins(dp(3),0,dp(3),0);return p;}
    private GradientDrawable panel(int color,int radius){GradientDrawable g=new GradientDrawable();g.setColor(color);g.setCornerRadius(dp(radius));g.setStroke(dp(1),0x55FFFFFF);return g;}
    private int dp(int x){return Math.round(x*getResources().getDisplayMetrics().density);}

    @Override protected void onPause(){super.onPause();if(estate!=null)estate.onPause();}
    @Override protected void onResume(){super.onResume();if(estate!=null)estate.onResume();}
}
