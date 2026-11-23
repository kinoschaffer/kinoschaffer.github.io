package com.lineasdeltrono.app;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;

/** Guarda las alarmas como JSON en SharedPreferences (misma forma que usa la página). */
final class AlarmStore {
    private static final String PREFS = "alarmas";
    private static final String KEY = "lista";

    static String getJson(Context c) {
        return prefs(c).getString(KEY, "[]");
    }

    static void setJson(Context c, String json) {
        prefs(c).edit().putString(KEY, json).apply();
    }

    static JSONArray getAll(Context c) {
        try { return new JSONArray(getJson(c)); } catch (Exception e) { return new JSONArray(); }
    }

    static JSONObject find(Context c, int id) {
        JSONArray a = getAll(c);
        for (int i = 0; i < a.length(); i++) {
            JSONObject o = a.optJSONObject(i);
            if (o != null && o.optInt("id") == id) return o;
        }
        return null;
    }

    /** Desactiva una alarma de "una vez" tras sonar. */
    static void disableOnce(Context c, int id) {
        JSONArray a = getAll(c);
        boolean changed = false;
        for (int i = 0; i < a.length(); i++) {
            JSONObject o = a.optJSONObject(i);
            if (o != null && o.optInt("id") == id && o.optInt("days") == 0) {
                try { o.put("on", false); changed = true; } catch (Exception ignored) { }
            }
        }
        if (changed) setJson(c, a.toString());
    }

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
