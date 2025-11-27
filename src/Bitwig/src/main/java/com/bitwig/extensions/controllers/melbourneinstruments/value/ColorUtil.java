package com.bitwig.extensions.controllers.melbourneinstruments.value;

import java.util.HashMap;
import java.util.Map;

import com.bitwig.extension.api.Color;

public class ColorUtil {

    private final static Map<Integer, Integer> COLOR_MAPPING = new HashMap<>();
    private final static int[] COLORS = {
        0xff94a6,
        0xffa529,
        0xcc9926,
        0xf6f47d,
        0xbffb00,
        0x1eff2e,
        0x28ffa8,
        0x5cffe8,
        0x8bc5ff,
        0x5480e4,
        0x92a7ff,
        0xd86ce4,
        0xe553a0,
        0xFFFFFF,
        // Row 1
        0xff3536,
        0xf66c03,
        0x99614b,
        0xe1d52d,
        0x87ff68,
        0x3ec303,
        0x02bfaf,
        0x18e9ff,
        0x0fa4ee,
        0x027dc0,
        0x896ce4,
        0xb677c6,
        0xff39d4,
        0xd0d0d0,
        // Row 2
        0xe4685a,
        0xffa374,
        0xd3ad71,
        0xedffae,
        0xd2e498,
        0xbad074,
        0x9bc48d,
        0xd4fde1,
        0xcdf1f8,
        0xb8c1e3,
        0xcdbbe4,
        0xae98e5,
        0xe5dce1,
        0xa9a9a9,
        // Row 3,
        0xe6928b,
        0xb78256,
        0x98836a,
        0xbfba6a,
        0xa7be00,
        0x89c2ba,
        0x96C1BA,
        0x9cb3c4,
        0x85a5c7,
        0x8392cd,
        0xa595b5,
        0xbf9fbe,
        0xbc7195,
        0x7b7b7b,
        // row 4
        0xaf3333,
        0xa95131,
        0x724f41,
        0xdbc300,
        0x85951f,
        0x539f31,
        0x089c8e,
        0x226384,
        0x1a2e96,
        0x2f52a2,
        0x614bad,
        0xa34bad,
        0xcc2e6d,
        0x3c3c3c,
        // row 5
        0x000000,
        0xff0000,
        0x03ff00,
        0xffff00,
        0x0000ff,
        0xff00ff,
        0x03ffff,
        0x800000,
        0x808000,
        0x008002,
        0x008080,
        0x000080,
        0x800080
    };

    public static int toColor(final Color color) {
        return toColor(color.getRed(), color.getGreen(), color.getBlue());
    }

    public static int toColor(final double r, final double g, final double b) {
        final int red = (int) (r * 255);
        final int green = (int) (g * 255);
        final int blue = (int) (b * 255);
        final int code = (red << 16) | (green << 8) | blue;
        return COLOR_MAPPING.computeIfAbsent(code, key -> findClosestColor(red, green, blue));
    }

    public static int findClosestColor(final int red, final int green, final int blue) {
        int closestIndex = 0;
        double minDistance = Double.MAX_VALUE;

        for (int index = 0; index < COLORS.length; index++) {
            final int color = COLORS[index];
            final int colorR = (color >> 16) & 0xFF;
            final int colorG = (color >> 8) & 0xFF;
            final int colorB = color & 0xFF;

            final double distance =
                Math.sqrt(Math.pow(red - colorR, 2) + Math.pow(green - colorG, 2) + Math.pow(blue - colorB, 2));

            if (distance < minDistance) {
                minDistance = distance;
                closestIndex = index;
            }
        }

        return closestIndex;
    }
}
