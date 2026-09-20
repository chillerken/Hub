package online.luxwash.voice;

import android.content.*;
import android.database.Cursor;
import android.database.sqlite.*;
import java.util.*;

public final class DbHelper extends SQLiteOpenHelper {
    private static final String DB = "luxwash_voice.db";
    private static final int VER = 1;

    public DbHelper(Context c) { super(c, DB, null, VER); }

    @Override public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE prospects(id INTEGER PRIMARY KEY AUTOINCREMENT, pkey TEXT UNIQUE NOT NULL, name TEXT NOT NULL, sector TEXT, website TEXT, email TEXT, phone TEXT, created_at INTEGER NOT NULL, contacted_at INTEGER, last_email_status TEXT)");
        db.execSQL("CREATE TABLE actions(id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, type TEXT NOT NULL, detail TEXT, success INTEGER NOT NULL)");
        db.execSQL("CREATE INDEX idx_actions_at ON actions(at)");
    }

    @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {}

    public boolean isKnown(String key) {
        try (Cursor c = getReadableDatabase().rawQuery("SELECT 1 FROM prospects WHERE pkey=? LIMIT 1", new String[]{key})) {
            return c.moveToFirst();
        }
    }

    public int saveProspects(List<Prospect> items) {
        SQLiteDatabase db = getWritableDatabase();
        int added = 0;
        for (Prospect p : items) {
            ContentValues v = new ContentValues();
            v.put("pkey", p.key()); v.put("name", p.name); v.put("sector", p.sector);
            v.put("website", p.website); v.put("email", p.email); v.put("phone", p.phone);
            v.put("created_at", System.currentTimeMillis());
            long id = db.insertWithOnConflict("prospects", null, v, SQLiteDatabase.CONFLICT_IGNORE);
            if (id != -1) added++;
        }
        log("prospects", added + " nieuwe prospects opgeslagen", true);
        return added;
    }

    public List<Prospect> getUncontactedWithEmail(int limit) {
        List<Prospect> out = new ArrayList<>();
        try (Cursor c = getReadableDatabase().rawQuery(
                "SELECT name,sector,website,email,phone FROM prospects WHERE contacted_at IS NULL AND email<>'' ORDER BY created_at DESC LIMIT ?",
                new String[]{String.valueOf(limit)})) {
            while (c.moveToNext()) out.add(new Prospect(c.getString(0), c.getString(1), c.getString(2), c.getString(3), c.getString(4)));
        }
        return out;
    }

    public void markContacted(Prospect p, String status) {
        ContentValues v = new ContentValues();
        v.put("contacted_at", System.currentTimeMillis());
        v.put("last_email_status", status);
        getWritableDatabase().update("prospects", v, "pkey=?", new String[]{p.key()});
    }

    public void log(String type, String detail, boolean success) {
        ContentValues v = new ContentValues();
        v.put("at", System.currentTimeMillis()); v.put("type", type);
        v.put("detail", detail); v.put("success", success ? 1 : 0);
        getWritableDatabase().insert("actions", null, v);
    }

    public String briefingText() {
        long since = System.currentTimeMillis() - 24L * 60L * 60L * 1000L;
        int prospects = scalar("SELECT COUNT(*) FROM prospects WHERE created_at>=?", since);
        int sent = scalar("SELECT COUNT(*) FROM actions WHERE at>=? AND type='email' AND success=1", since);
        int failures = scalar("SELECT COUNT(*) FROM actions WHERE at>=? AND success=0", since);
        int commands = scalar("SELECT COUNT(*) FROM actions WHERE at>=? AND type='command'", since);
        StringBuilder s = new StringBuilder("Dit is uw LuxWash briefing. ");
        s.append("In de afgelopen vierentwintig uur vond ik ").append(prospects).append(" nieuwe prospects. ");
        s.append(sent).append(" e-mails werden succesvol verstuurd. ");
        s.append("Ik verwerkte ").append(commands).append(" spraakopdrachten. ");
        if (failures > 0) s.append("Er waren ").append(failures).append(" acties met een fout die aandacht vragen. ");
        else s.append("Er zijn geen geregistreerde fouten. ");
        return s.toString();
    }

    public String statusText() {
        int total = scalar("SELECT COUNT(*) FROM prospects", null);
        int open = scalar("SELECT COUNT(*) FROM prospects WHERE contacted_at IS NULL AND email<>''", null);
        return "LuxWash Voice is actief. Er staan " + total + " prospects in het lokale CRM, waarvan " + open + " met e-mailadres nog niet gecontacteerd zijn.";
    }

    private int scalar(String sql, Long arg) {
        String[] args = arg == null ? null : new String[]{String.valueOf(arg)};
        try (Cursor c = getReadableDatabase().rawQuery(sql, args)) { return c.moveToFirst() ? c.getInt(0) : 0; }
    }
}
