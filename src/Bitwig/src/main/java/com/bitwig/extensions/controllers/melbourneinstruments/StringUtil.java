package com.bitwig.extensions.controllers.melbourneinstruments;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.List;

public class StringUtil {
    private static final char[] SPECIALS = {
        'ä', 'ü', 'ö', 'Ä', 'Ü', 'Ö', 'ß', 'é', 'è', 'ê', 'â', 'á', 'à', //
        'û', 'ú', 'ù', 'ô', 'ó', 'ò'
    };
    private static final String[] REPLACE = {
        "a", "u", "o", "A", "U", "O", "ss", "e", "e", "e", "a", "a", "a", //
        "u", "u", "u", "o", "o", "o"
    };
    
    public static String toHexString(final int value) {
        final String str = Integer.toHexString(value);
        if (str.length() < 2) {
            return "0" + str;
        }
        return str;
    }
    
    public static String toSysExName(final String name) {
        final StringBuilder cmd = new StringBuilder();
        final String text = toAsciiDisplay(name, 13);
        for (int i = 0; i < 13; i++) {
            if (i < text.length()) {
                cmd.append("%02X ".formatted((int) text.charAt(i)));
            } else {
                cmd.append("00 ");
            }
        }
        return cmd.toString();
    }
    
    public static String toAsciiDisplay(final String name, final int maxLen) {
        if (name == null) {
            return "";
        }
        final StringBuilder b = new StringBuilder();
        for (int i = 0; i < name.length() && b.length() < maxLen; i++) {
            final char c = name.charAt(i);
            //            if (c == 32) {
            //                continue;
            //            }
            if (c < 128) {
                b.append(c);
            } else {
                final int replacement = getReplace(c);
                if (replacement >= 0) {
                    b.append(REPLACE[replacement]);
                }
            }
        }
        return b.toString();
    }
    
    private static int getReplace(final char c) {
        for (int i = 0; i < SPECIALS.length; i++) {
            if (c == SPECIALS[i]) {
                return i;
            }
        }
        return -1;
    }
    
    public static String nameToSysEx(final String name) {
        final StringBuilder cmd = new StringBuilder();
        final String text = StringUtil.toAsciiDisplay(name, 12);
        for (int i = 0; i < 13; i++) {
            if (i < text.length()) {
                cmd.append("%02X ".formatted((int) text.charAt(i)));
            } else {
                cmd.append("00 ");
            }
        }
        return cmd.toString();
    }
    
    
    public static byte[] getPluginHash(final String pluginName, final int hashSize) {
        try {
            final byte[] inputBytes = pluginName.getBytes(StandardCharsets.UTF_8);
            final MessageDigest digest = MessageDigest.getInstance("SHA-1");
            final byte[] hashBytes = digest.digest(inputBytes);
            final byte[] pluginDigest = new byte[hashSize];
            for (int ix = 0; ix < hashSize; ix++) {
                pluginDigest[ix] = processHashObject(hashBytes, ix);
            }
            return pluginDigest;
        }
        catch (final NoSuchAlgorithmException exception) {
            return new byte[hashSize];
        }
    }
    
    public static byte processHashObject(final byte[] hashBytes, final int index) {
        return (byte) (hashBytes[index] & 0x7f);
    }
    
    public static List<String> createHash(final String name, final int size) {
        final byte[] hashValue = getPluginHash(name, size);
        final ArrayList<String> list = new ArrayList<String>();
        
        for (int i = 0; i < size; i++) {
            list.add(StringUtil.toHexString(hashValue[i]));
        }
        return list;
    }
    
    public static String toAscii(final String data) {
        final StringBuilder output = new StringBuilder();
        for (int i = 0; i < data.length(); i += 2) {
            final String str = data.substring(i, i + 2);
            output.append((char) Integer.parseInt(str, 16));
        }
        return output.toString();
    }
    
}
