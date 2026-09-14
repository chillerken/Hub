package com.gertjan.fitlog;

import android.app.Activity;
import android.app.AlertDialog;
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

import java.text.DecimalFormat;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

public class MainActivity extends Activity {
    private static final int BG = Color.rgb(15, 18, 22);
    private static final int CARD = Color.rgb(27, 31, 37);
    private static final int CARD2 = Color.rgb(36, 41, 49);
    private static final int GOLD = Color.rgb(246, 190, 65);
    private static final int GREEN = Color.rgb(95, 205, 137);
    private static final int WHITE = Color.rgb(245, 247, 250);
    private static final int MUTED = Color.rgb(170, 178, 188);

    private final LinkedHashMap<String, List<Exercise>> plans = new LinkedHashMap<>();
    private SharedPreferences prefs;
    private LinearLayout content;
    private String selected = "PULL";
    private final DecimalFormat kgFmt = new DecimalFormat("0.#");

    static class Exercise {
        final String name;
        final String starter;
        final int minReps;
        final int maxReps;
        final double increment;
        final boolean assistance;

        Exercise(String name, String starter, int minReps, int maxReps, double increment) {
            this(name, starter, minReps, maxReps, increment, false);
        }

        Exercise(String name, String starter, int minReps, int maxReps, double increment, boolean assistance) {
            this.name = name;
            this.starter = starter;
            this.minReps = minReps;
            this.maxReps = maxReps;
            this.increment = increment;
            this.assistance = assistance;
        }
    }

    static class SetRow {
        final String date;
        final double kg;
        final int reps;
        final int rir;

        SetRow(String date, double kg, int reps, int rir) {
            this.date = date;
            this.kg = kg;
            this.reps = reps;
            this.rir = rir;
        }
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
        push.add(new Exercise("Barbell Bench Press", "40×10 · 50×8 · 55×8", 6, 10, 2.5));
        push.add(new Exercise("Chest Press machine", "45×10 · 50×10 · 55×8", 8, 10, 2.5));
        push.add(new Exercise("Incline DB Press", "10×10 · 12×10 · 12×8–10", 8, 12, 2.0));
        push.add(new Exercise("Shoulder Press machine", "20×10 · 23×10 · 27×8", 8, 10, 2.5));
        push.add(new Exercise("DB Lateral Raise", "4×12 · 5×12 · 5×12", 10, 15, 1.0));
        push.add(new Exercise("Assisted Dips", "25 assist×10 · 20–25×10 · 20×8–10", 8, 12, 5.0, true));
        plans.put("PUSH", push);

        List<Exercise> pull = new ArrayList<>();
        pull.add(new Exercise("Neutral Grip Lat Pulldown", "52×10 · 55×10 · 59×10", 8, 10, 2.5));
        pull.add(new Exercise("Seated Cable Row", "52×10 · 55×10 · 57×10", 8, 10, 2.5));
        pull.add(new Exercise("Chest Supported Row", "30×10 · 35×10 · 40×8", 8, 10, 2.5));
        pull.add(new Exercise("Hammer Curl", "8×10 · 8×10 · 10×10", 8, 12, 2.0));
        plans.put("PULL", pull);

        List<Exercise> legs = new ArrayList<>();
        legs.add(new Exercise("Squat / Smith Squat", "30×10 · 40×8 · 45×8", 6, 10, 2.5));
        legs.add(new Exercise("Leg Press", "70×12 · 80×10 · 90×10", 8, 12, 5.0));
        legs.add(new Exercise("Leg Extension", "25×12 · 30×10 · 35×10", 10, 15, 2.5));
        legs.add(new Exercise("Leg Curl", "25×12 · 30×10 · 35×10", 10, 15, 2.5));
        legs.add(new Exercise("Romanian Deadlift", "30×10 · 35×10 · 40×8", 6, 10, 2.5));
        legs.add(new Exercise("Calf Raise", "40×15 · 45×12 · 50×12", 10, 15, 5.0));
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

    private String today() {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(new Date());
    }

    private void render() {
        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(BG);
        content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(16), dp(22), dp(16), dp(32));
        scroll.addView(content);

        TextView title = text("FITLOG AI", 30, WHITE, true);
        content.addView(title);
        TextView sub = text("PPL · automatische progressie · volledig op je telefoon", 14, MUTED, false);
        sub.setPadding(0, 0, 0, dp(14));
        content.addView(sub);

        addCoachCard();
        addTabs();

        TextView head = text(selected + " TRAINING", 22, GOLD, true);
        head.setPadding(dp(4), dp(8), 0, dp(10));
        content.addView(head);

        for (Exercise ex : plans.get(selected)) addExerciseCard(ex);

        Button finish = new Button(this);
        finish.setText("✓ TRAINING AFRONDEN & VOLGENDE BEREKENEN");
        finish.setTextColor(Color.BLACK);
        finish.setBackgroundColor(GOLD);
        LinearLayout.LayoutParams fp = new LinearLayout.LayoutParams(-1, dp(58));
        fp.setMargins(0, dp(8), 0, dp(8));
        finish.setLayoutParams(fp);
        finish.setOnClickListener(v -> finishTraining());
        content.addView(finish);

        Button history = new Button(this);
        history.setText("TRAININGSGESCHIEDENIS");
        history.setTextColor(WHITE);
        history.setBackgroundColor(CARD2);
        history.setOnClickListener(v -> showSessionHistory());
        content.addView(history);

        TextView rule = text("Autoprogressie: haal eerst meer reps. Bij de bovengrens met voldoende marge verhoogt FitLog het gewicht. Bij RIR 0 of gemiste reps houdt of verlaagt de app automatisch.", 13, MUTED, false);
        rule.setPadding(dp(6), dp(14), dp(6), 0);
        content.addView(rule);

        setContentView(scroll);
    }

    private void addCoachCard() {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(14), dp(12), dp(14), dp(12));
        card.setBackgroundColor(CARD);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.setMargins(0, 0, 0, dp(14));
        card.setLayoutParams(lp);

        card.addView(text("AUTOMATISCHE COACH", 14, GREEN, true));
        int todaySets = countSetsForDate(selected, today());
        String latest = latestSessionDate(selected);
        String info;
        if (todaySets > 0) {
            info = "Vandaag: " + todaySets + " sets gelogd. Rond je training af om je volgende doelen meteen te zien.";
        } else if (latest != null) {
            info = "Laatste " + selected + ": " + latest + ". Je volgende doelen zijn hieronder al berekend.";
        } else {
            info = "Nog geen " + selected + "-training gelogd. Start met de voorgestelde herstartgewichten.";
        }
        TextView t = text(info, 14, WHITE, false);
        t.setPadding(0, dp(4), 0, 0);
        card.addView(t);
        content.addView(card);
    }

    private void addTabs() {
        LinearLayout tabs = new LinearLayout(this);
        tabs.setOrientation(LinearLayout.HORIZONTAL);
        for (String session : plans.keySet()) {
            Button b = new Button(this);
            b.setText(session);
            b.setTextColor(session.equals(selected) ? Color.BLACK : WHITE);
            b.setBackgroundColor(session.equals(selected) ? GOLD : CARD);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, dp(48), 1f);
            lp.setMargins(dp(3), 0, dp(3), dp(6));
            b.setLayoutParams(lp);
            b.setOnClickListener(v -> { selected = session; render(); });
            tabs.addView(b);
        }
        content.addView(tabs);
    }

    private void addExerciseCard(Exercise ex) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(14), dp(14), dp(14), dp(12));
        card.setBackgroundColor(CARD);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.setMargins(0, 0, 0, dp(10));
        card.setLayoutParams(lp);

        card.addView(text(ex.name, 18, WHITE, true));

        String raw = prefs.getString(key(selected, ex.name), "");
        List<SetRow> latestRows = latestRows(raw);
        String suggestion = latestRows.isEmpty() ? "Start: " + ex.starter : "Volgend doel: " + suggestionFor(ex, latestRows);
        TextView target = text(suggestion, 14, GOLD, true);
        target.setPadding(0, dp(4), 0, dp(5));
        card.addView(target);

        TextView hist = text(formatHistory(raw), 13, MUTED, false);
        hist.setPadding(0, 0, 0, dp(9));
        card.addView(hist);

        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);

        Button add = new Button(this);
        add.setText("+ SET");
        add.setTextColor(WHITE);
        add.setBackgroundColor(CARD2);
        LinearLayout.LayoutParams ap = new LinearLayout.LayoutParams(0, dp(48), 1.3f);
        ap.setMargins(0, 0, dp(4), 0);
        add.setLayoutParams(ap);
        add.setOnClickListener(v -> showAddSet(ex));
        row.addView(add);

        Button details = new Button(this);
        details.setText("HISTORIE");
        details.setTextColor(WHITE);
        details.setBackgroundColor(CARD2);
        LinearLayout.LayoutParams dp = new LinearLayout.LayoutParams(0, this.dp(48), 1f);
        dp.setMargins(this.dp(4), 0, 0, 0);
        details.setLayoutParams(dp);
        details.setOnClickListener(v -> showExerciseHistory(ex));
        row.addView(details);

        card.addView(row);
        content.addView(card);
    }

    private void showAddSet(Exercise ex) {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(20), dp(8), dp(20), 0);

        EditText kg = field(ex.assistance ? "Assistentie kg" : "Gewicht kg", true);
        EditText reps = field("Reps", true);
        EditText rir = field("RIR (aanbevolen: 0–5)", true);

        List<SetRow> latest = latestRows(prefs.getString(key(selected, ex.name), ""));
        if (!latest.isEmpty()) {
            SetRow last = latest.get(latest.size() - 1);
            kg.setText(kgFmt.format(last.kg));
            reps.setText(String.valueOf(Math.min(ex.maxReps, Math.max(ex.minReps, last.reps + 1))));
        }

        box.addView(kg);
        box.addView(reps);
        box.addView(rir);

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
                    try {
                        double kgValue = Double.parseDouble(k);
                        int repsValue = Integer.parseInt(r);
                        int rirValue = rr.isEmpty() ? -1 : Integer.parseInt(rr);
                        if (kgValue < 0 || repsValue < 1 || (rirValue > 10)) throw new NumberFormatException();
                    } catch (NumberFormatException e) {
                        Toast.makeText(this, "Controleer gewicht, reps en RIR.", Toast.LENGTH_SHORT).show();
                        return;
                    }
                    appendRaw(selected, ex.name, today() + "|" + k + "|" + r + "|" + (rr.isEmpty() ? "-" : rr));
                    render();
                }).show();
    }

    private EditText field(String hint, boolean decimal) {
        EditText e = new EditText(this);
        e.setHint(hint);
        e.setTextColor(Color.BLACK);
        e.setHintTextColor(Color.DKGRAY);
        e.setSingleLine(true);
        e.setInputType(InputType.TYPE_CLASS_NUMBER | (decimal ? InputType.TYPE_NUMBER_FLAG_DECIMAL : 0));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, dp(52));
        lp.setMargins(0, dp(5), 0, dp(5));
        e.setLayoutParams(lp);
        return e;
    }

    private List<SetRow> parseRows(String raw) {
        List<SetRow> out = new ArrayList<>();
        if (raw == null || raw.trim().isEmpty()) return out;
        String[] rows = raw.split(";");
        for (String row : rows) {
            String[] p = row.split("\\|", -1);
            if (p.length < 4) continue;
            try {
                double kg = Double.parseDouble(p[1].replace(',', '.'));
                int reps = Integer.parseInt(p[2]);
                int rir = p[3].equals("-") || p[3].isEmpty() ? -1 : Integer.parseInt(p[3]);
                out.add(new SetRow(p[0], kg, reps, rir));
            } catch (Exception ignored) { }
        }
        return out;
    }

    private List<SetRow> latestRows(String raw) {
        List<SetRow> all = parseRows(raw);
        List<SetRow> out = new ArrayList<>();
        if (all.isEmpty()) return out;
        String d = all.get(all.size() - 1).date;
        for (SetRow r : all) if (d.equals(r.date)) out.add(r);
        return out;
    }

    private String formatHistory(String raw) {
        List<SetRow> rows = latestRows(raw);
        if (rows.isEmpty()) return "Nog geen sets gelogd.";
        StringBuilder sb = new StringBuilder("Laatste: ");
        for (int i = 0; i < rows.size(); i++) {
            if (i > 0) sb.append(" · ");
            SetRow r = rows.get(i);
            sb.append(kgFmt.format(r.kg)).append("×").append(r.reps);
            if (r.rir >= 0) sb.append(" RIR").append(r.rir);
        }
        return sb.toString();
    }

    private String suggestionFor(Exercise ex, List<SetRow> rows) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < rows.size(); i++) {
            if (i > 0) sb.append(" · ");
            SetRow r = rows.get(i);
            double nextKg = r.kg;
            int nextReps;

            boolean maxed = r.reps >= ex.maxReps;
            boolean enoughMargin = r.rir < 0 || r.rir >= 2;
            boolean failedRange = r.reps < ex.minReps;
            boolean trueFailure = r.rir == 0;

            if (maxed && enoughMargin) {
                nextKg = ex.assistance ? Math.max(0, r.kg - ex.increment) : r.kg + ex.increment;
                nextReps = ex.minReps;
            } else if (failedRange || (trueFailure && r.reps <= ex.minReps)) {
                nextKg = ex.assistance ? r.kg + ex.increment : Math.max(0, r.kg - ex.increment);
                nextReps = ex.minReps;
            } else {
                nextReps = Math.min(ex.maxReps, r.reps + 1);
            }

            sb.append(kgFmt.format(nextKg)).append("×").append(nextReps);
            if (ex.assistance) sb.append(" assist");
        }
        return sb.toString();
    }

    private void finishTraining() {
        int todaySets = countSetsForDate(selected, today());
        if (todaySets == 0) {
            Toast.makeText(this, "Je hebt vandaag nog geen " + selected + "-sets gelogd.", Toast.LENGTH_LONG).show();
            return;
        }

        StringBuilder summary = new StringBuilder();
        summary.append("Vandaag: ").append(todaySets).append(" sets\n\nVOLGENDE ").append(selected).append(":\n");
        for (Exercise ex : plans.get(selected)) {
            String raw = prefs.getString(key(selected, ex.name), "");
            List<SetRow> rows = rowsForDate(raw, today());
            if (rows.isEmpty()) continue;
            summary.append("\n").append(ex.name).append("\n").append(suggestionFor(ex, rows));
        }
        summary.append("\n\nRichtlijn: mik meestal op 2–3 RIR tijdens deze herstart. Bij pijn of slechte techniek niet verhogen.");
        prefs.edit().putString("completed::" + selected, today()).apply();

        new AlertDialog.Builder(this)
                .setTitle("Training opgeslagen ✓")
                .setMessage(summary.toString())
                .setPositiveButton("Klaar", (d, w) -> render())
                .show();
    }

    private List<SetRow> rowsForDate(String raw, String date) {
        List<SetRow> out = new ArrayList<>();
        for (SetRow r : parseRows(raw)) if (date.equals(r.date)) out.add(r);
        return out;
    }

    private int countSetsForDate(String session, String date) {
        int total = 0;
        List<Exercise> list = plans.get(session);
        if (list == null) return 0;
        for (Exercise ex : list) total += rowsForDate(prefs.getString(key(session, ex.name), ""), date).size();
        return total;
    }

    private String latestSessionDate(String session) {
        String latest = null;
        List<Exercise> list = plans.get(session);
        if (list == null) return null;
        for (Exercise ex : list) {
            for (SetRow r : parseRows(prefs.getString(key(session, ex.name), ""))) {
                if (latest == null || r.date.compareTo(latest) > 0) latest = r.date;
            }
        }
        return latest;
    }

    private void showExerciseHistory(Exercise ex) {
        List<SetRow> rows = parseRows(prefs.getString(key(selected, ex.name), ""));
        if (rows.isEmpty()) {
            Toast.makeText(this, "Nog geen geschiedenis.", Toast.LENGTH_SHORT).show();
            return;
        }
        StringBuilder sb = new StringBuilder();
        String current = "";
        for (SetRow r : rows) {
            if (!r.date.equals(current)) {
                if (!current.isEmpty()) sb.append("\n");
                current = r.date;
                sb.append(current).append("\n");
            }
            sb.append("  ").append(kgFmt.format(r.kg)).append(" kg × ").append(r.reps);
            if (r.rir >= 0) sb.append(" · RIR ").append(r.rir);
            sb.append("\n");
        }
        new AlertDialog.Builder(this)
                .setTitle(ex.name)
                .setMessage(sb.toString())
                .setPositiveButton("Sluiten", null)
                .show();
    }

    private void showSessionHistory() {
        Set<String> dates = new LinkedHashSet<>();
        for (Exercise ex : plans.get(selected)) {
            for (SetRow r : parseRows(prefs.getString(key(selected, ex.name), ""))) dates.add(r.date);
        }
        if (dates.isEmpty()) {
            Toast.makeText(this, "Nog geen trainingen opgeslagen.", Toast.LENGTH_SHORT).show();
            return;
        }
        List<String> ordered = new ArrayList<>(dates);
        StringBuilder sb = new StringBuilder();
        for (int d = ordered.size() - 1; d >= 0; d--) {
            String date = ordered.get(d);
            sb.append(date).append(" · ").append(countSetsForDate(selected, date)).append(" sets\n");
            for (Exercise ex : plans.get(selected)) {
                List<SetRow> rows = rowsForDate(prefs.getString(key(selected, ex.name), ""), date);
                if (rows.isEmpty()) continue;
                sb.append(ex.name).append(": ");
                for (int i = 0; i < rows.size(); i++) {
                    if (i > 0) sb.append(" / ");
                    sb.append(kgFmt.format(rows.get(i).kg)).append("×").append(rows.get(i).reps);
                }
                sb.append("\n");
            }
            sb.append("\n");
        }
        new AlertDialog.Builder(this)
                .setTitle(selected + " geschiedenis")
                .setMessage(sb.toString())
                .setPositiveButton("Sluiten", null)
                .show();
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
