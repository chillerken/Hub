package com.gertjan.fitlog;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public class MainActivity extends Activity {
    private static final int BG = Color.rgb(15, 18, 22);
    private static final int CARD = Color.rgb(27, 31, 37);
    private static final int GOLD = Color.rgb(246, 190, 65);
    private static final int WHITE = Color.rgb(245, 247, 250);
    private static final int MUTED = Color.rgb(170, 178, 188);

    private final LinkedHashMap<String, List<Exercise>> plans = new LinkedHashMap<>();
    private SharedPreferences prefs;
    private LinearLayout content;
    private String selected = "PULL";

    static class Exercise {
        final String name;
        final String target;
        Exercise(String name, String target) { this.name = name; this.target = target; }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences("fitlog", MODE_PRIVATE);
        buildPlans();
        seedPullLog();
        render();
    }

    private void buildPlans() {
        List<Exercise> push = new ArrayList<>();
        push.add(new Exercise("Barbell Bench Press", "40×10  ·  50×8  ·  55×8"));
        push.add(new Exercise("Chest Press machine", "45×10  ·  50×10  ·  55×8"));
        push.add(new Exercise("Incline DB Press", "10×10  ·  12×10  ·  12×8–10"));
        push.add(new Exercise("Shoulder Press machine", "20×10  ·  23×10  ·  27×8"));
        push.add(new Exercise("DB Lateral Raise", "4×12  ·  5×12  ·  5×12"));
        push.add(new Exercise("Assisted Dips", "25 kg assist ×10  ·  20–25×10  ·  20×8–10"));
        plans.put("PUSH", push);

        List<Exercise> pull = new ArrayList<>();
        pull.add(new Exercise("Neutral Grip Lat Pulldown", "Volgende: 52.5×10  ·  57.5×10  ·  62.5×8–10"));
        pull.add(new Exercise("Seated Cable Row", "Volgende: 55×10  ·  57×10  ·  60×8–10"));
        pull.add(new Exercise("Chest Supported Row", "Doel: 30×10  ·  35×10  ·  40×10"));
        pull.add(new Exercise("Hammer Curl", "Doel: 8×10  ·  10×10  ·  10×10"));
        plans.put("PULL", pull);

        List<Exercise> legs = new ArrayList<>();
        legs.add(new Exercise("Squat / Smith Squat", "30×10  ·  40×8  ·  45×8"));
        legs.add(new Exercise("Leg Press", "70×12  ·  80×10  ·  90×10"));
        legs.add(new Exercise("Leg Extension", "25×12  ·  30×10  ·  35×10"));
        legs.add(new Exercise("Leg Curl", "25×12  ·  30×10  ·  35×10"));
        legs.add(new Exercise("Romanian Deadlift", "30×10  ·  35×10  ·  40×8"));
        legs.add(new Exercise("Calf Raise", "40×15  ·  45×12  ·  50×12"));
        plans.put("LEGS", legs);
    }

    private void seedPullLog() {
        if (prefs.getBoolean("seeded_v1", false)) return;
        String d = "2026-09-13";
        seed("PULL", "Neutral Grip Lat Pulldown", d, "52", "10", "-");
        seed("PULL", "Neutral Grip Lat Pulldown", d, "55", "10", "-");
        seed("PULL", "Neutral Grip Lat Pulldown", d, "59", "10", "-");
        seed("PULL", "Seated Cable Row", d, "52", "10", "-");
        seed("PULL", "Seated Cable Row", d, "55", "10", "-");
        seed("PULL", "Seated Cable Row", d, "57", "10", "-");
        seed("PULL", "Chest Supported Row", d, "30", "10", "-");
        seed("PULL", "Chest Supported Row", d, "35", "10", "-");
        seed("PULL", "Chest Supported Row", d, "40", "8", "-");
        seed("PULL", "Hammer Curl", d, "8", "10", "-");
        seed("PULL", "Hammer Curl", d, "8", "10", "-");
        seed("PULL", "Hammer Curl", d, "10", "10", "-");
        prefs.edit().putBoolean("seeded_v1", true).apply();
    }

    private void seed(String session, String exercise, String date, String kg, String reps, String rir) {
        appendRaw(session, exercise, date + "|" + kg + "|" + reps + "|" + rir);
    }

    private String key(String session, String exercise) {
        return "log::" + session + "::" + exercise;
    }

    private void appendRaw(String session, String exercise, String row) {
        String k = key(session, exercise);
        String old = prefs.getString(k, "");
        prefs.edit().putString(k, old.isEmpty() ? row : old + ";" + row).apply();
    }

    private void render() {
        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(BG);
        content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(16), dp(22), dp(16), dp(30));
        scroll.addView(content);

        TextView title = text("FITLOG", 30, WHITE, true);
        content.addView(title);
        TextView sub = text("PPL herstart · simpel loggen · lokaal opgeslagen", 14, MUTED, false);
        sub.setPadding(0, 0, 0, dp(18));
        content.addView(sub);

        LinearLayout tabs = new LinearLayout(this);
        tabs.setOrientation(LinearLayout.HORIZONTAL);
        for (String session : plans.keySet()) {
            Button b = new Button(this);
            b.setText(session);
            b.setTextColor(session.equals(selected) ? Color.BLACK : WHITE);
            b.setBackgroundColor(session.equals(selected) ? GOLD : CARD);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, dp(48), 1f);
            lp.setMargins(dp(3), 0, dp(3), dp(12));
            b.setLayoutParams(lp);
            b.setOnClickListener(v -> { selected = session; render(); });
            tabs.addView(b);
        }
        content.addView(tabs);

        TextView head = text(selected + " TRAINING", 22, GOLD, true);
        head.setPadding(dp(4), dp(4), 0, dp(10));
        content.addView(head);

        for (Exercise ex : plans.get(selected)) addExerciseCard(ex);

        Button copy = new Button(this);
        copy.setText("Kopieer " + selected + " log voor ChatGPT");
        copy.setTextColor(Color.BLACK);
        copy.setBackgroundColor(GOLD);
        LinearLayout.LayoutParams cp = new LinearLayout.LayoutParams(-1, dp(54));
        cp.setMargins(0, dp(10), 0, dp(8));
        copy.setLayoutParams(cp);
        copy.setOnClickListener(v -> copySession());
        content.addView(copy);

        TextView tip = text("Richtlijn herstart: werk meestal met 2–4 RIR. Verhoog pas wanneer de reps technisch strak blijven.", 13, MUTED, false);
        tip.setPadding(dp(6), dp(8), dp(6), 0);
        content.addView(tip);

        setContentView(scroll);
    }

    private void addExerciseCard(Exercise ex) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(14), dp(14), dp(14), dp(12));
        card.setBackgroundColor(CARD);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.setMargins(0, 0, 0, dp(10));
        card.setLayoutParams(lp);

        TextView name = text(ex.name, 18, WHITE, true);
        card.addView(name);
        TextView target = text(ex.target, 13, GOLD, false);
        target.setPadding(0, dp(3), 0, dp(8));
        card.addView(target);

        String history = prefs.getString(key(selected, ex.name), "");
        TextView hist = text(formatHistory(history), 14, MUTED, false);
        hist.setPadding(0, 0, 0, dp(8));
        card.addView(hist);

        Button add = new Button(this);
        add.setText("+ SET TOEVOEGEN");
        add.setTextColor(WHITE);
        add.setBackgroundColor(Color.rgb(48, 54, 63));
        add.setOnClickListener(v -> showAddSet(ex));
        card.addView(add);
        content.addView(card);
    }

    private String formatHistory(String raw) {
        if (raw == null || raw.isEmpty()) return "Nog geen sets gelogd.";
        String[] rows = raw.split(";");
        StringBuilder sb = new StringBuilder("Laatste sets: ");
        int start = Math.max(0, rows.length - 4);
        for (int i = start; i < rows.length; i++) {
            String[] p = rows[i].split("\\|", -1);
            if (p.length >= 4) {
                if (i > start) sb.append("  ·  ");
                sb.append(p[1]).append("×").append(p[2]);
                if (!p[3].equals("-") && !p[3].isEmpty()) sb.append(" (RIR ").append(p[3]).append(")");
            }
        }
        return sb.toString();
    }

    private void showAddSet(Exercise ex) {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(20), dp(8), dp(20), 0);

        EditText kg = field("Gewicht kg (bv. 57.5)", true);
        EditText reps = field("Reps", true);
        EditText rir = field("RIR (optioneel)", true);
        box.addView(kg); box.addView(reps); box.addView(rir);

        new AlertDialog.Builder(this)
                .setTitle(ex.name)
                .setView(box)
                .setNegativeButton("Annuleren", null)
                .setPositiveButton("Opslaan", (d, w) -> {
                    String k = kg.getText().toString().trim().replace(',', '.');
                    String r = reps.getText().toString().trim();
                    String rr = rir.getText().toString().trim();
                    if (k.isEmpty() || r.isEmpty()) {
                        Toast.makeText(this, "Vul gewicht en reps in.", Toast.LENGTH_SHORT).show();
                        return;
                    }
                    String date = new SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(new Date());
                    appendRaw(selected, ex.name, date + "|" + k + "|" + r + "|" + (rr.isEmpty() ? "-" : rr));
                    render();
                }).show();
    }

    private EditText field(String hint, boolean decimal) {
        EditText e = new EditText(this);
        e.setHint(hint);
        e.setTextColor(Color.BLACK);
        e.setHintTextColor(Color.DKGRAY);
        e.setSingleLine(true);
        e.setInputType(decimal ? (InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL) : InputType.TYPE_CLASS_TEXT);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, dp(52));
        lp.setMargins(0, dp(5), 0, dp(5));
        e.setLayoutParams(lp);
        return e;
    }

    private void copySession() {
        StringBuilder sb = new StringBuilder(selected).append(" training\n");
        for (Exercise ex : plans.get(selected)) {
            String raw = prefs.getString(key(selected, ex.name), "");
            sb.append(ex.name).append(": ");
            if (raw.isEmpty()) {
                sb.append("geen sets");
            } else {
                String[] rows = raw.split(";");
                int start = Math.max(0, rows.length - 3);
                for (int i = start; i < rows.length; i++) {
                    String[] p = rows[i].split("\\|", -1);
                    if (p.length >= 4) {
                        if (i > start) sb.append(" / ");
                        sb.append(p[1]).append("x").append(p[2]);
                        if (!p[3].equals("-") && !p[3].isEmpty()) sb.append(" RIR").append(p[3]);
                    }
                }
            }
            sb.append("\n");
        }
        ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        cm.setPrimaryClip(ClipData.newPlainText("FitLog", sb.toString()));
        Toast.makeText(this, "Training gekopieerd. Plak hem in ChatGPT 💪", Toast.LENGTH_LONG).show();
    }

    private TextView text(String s, int sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(sp);
        t.setTextColor(color);
        if (bold) t.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        t.setGravity(Gravity.START);
        return t;
    }

    private int dp(int value) {
        return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
    }
}
