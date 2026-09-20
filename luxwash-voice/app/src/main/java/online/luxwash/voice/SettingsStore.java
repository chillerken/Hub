package online.luxwash.voice;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;

public final class SettingsStore {
    private static final String PREF = "luxwash_settings";
    private static final String ALIAS = "luxwash_voice_secret";
    private final SharedPreferences p;

    public SettingsStore(Context c) { p = c.getSharedPreferences(PREF, Context.MODE_PRIVATE); }

    public String smtpHost() { return p.getString("smtp_host", "smtp.gmail.com"); }
    public int smtpPort() { try { return Integer.parseInt(p.getString("smtp_port", "465")); } catch(Exception e) { return 465; } }
    public String smtpUser() { return p.getString("smtp_user", ""); }
    public String smtpFrom() { return p.getString("smtp_from", "info@luxwash.online"); }
    public String webhookUrl() { return p.getString("webhook", ""); }
    public String dailyTime() { return p.getString("daily_time", "19:00"); }
    public boolean voiceEnabled() { return p.getBoolean("voice_enabled", false); }

    public String smtpPassword() {
        String enc = p.getString("smtp_pass", "");
        if (enc.isEmpty()) return "";
        try { return decrypt(enc); } catch (Exception e) { return ""; }
    }

    public void save(String host, String port, String user, String pass, String from, String webhook, String dailyTime) {
        SharedPreferences.Editor e = p.edit()
                .putString("smtp_host", host.trim()).putString("smtp_port", port.trim())
                .putString("smtp_user", user.trim()).putString("smtp_from", from.trim())
                .putString("webhook", webhook.trim()).putString("daily_time", dailyTime.trim());
        if (pass != null && !pass.isEmpty()) {
            try { e.putString("smtp_pass", encrypt(pass)); } catch (Exception ignored) {}
        }
        e.apply();
    }

    public void setVoiceEnabled(boolean value) { p.edit().putBoolean("voice_enabled", value).apply(); }

    public boolean smtpReady() { return !smtpUser().isEmpty() && !smtpPassword().isEmpty() && !smtpFrom().isEmpty(); }

    private SecretKey key() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore"); ks.load(null);
        if (ks.containsAlias(ALIAS)) return ((KeyStore.SecretKeyEntry)ks.getEntry(ALIAS, null)).getSecretKey();
        KeyGenerator kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        kg.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return kg.generateKey();
    }

    private String encrypt(String plain) throws Exception {
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding"); c.init(Cipher.ENCRYPT_MODE, key());
        byte[] iv = c.getIV(), data = c.doFinal(plain.getBytes(StandardCharsets.UTF_8));
        byte[] both = new byte[iv.length + data.length];
        System.arraycopy(iv,0,both,0,iv.length); System.arraycopy(data,0,both,iv.length,data.length);
        return Base64.encodeToString(both, Base64.NO_WRAP);
    }

    private String decrypt(String encoded) throws Exception {
        byte[] both = Base64.decode(encoded, Base64.NO_WRAP);
        byte[] iv = new byte[12], data = new byte[both.length - 12];
        System.arraycopy(both,0,iv,0,12); System.arraycopy(both,12,data,0,data.length);
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        c.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, iv));
        return new String(c.doFinal(data), StandardCharsets.UTF_8);
    }
}
