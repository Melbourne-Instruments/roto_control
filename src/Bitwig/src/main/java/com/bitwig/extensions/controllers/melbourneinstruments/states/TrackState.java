package com.bitwig.extensions.controllers.melbourneinstruments.states;

import com.bitwig.extensions.controllers.melbourneinstruments.StringUtil;

public class TrackState {
    private String midiString;
    private String name;
    private int colorIndex;
    private boolean exists;
    private boolean isGroup;

    public TrackState() {
        this.colorIndex = 70;
    }

    public void setName(final String name) {
        this.name = name;
        this.midiString = StringUtil.nameToSysEx(name);
    }

    public String getName() {
        return name;
    }

    public void setColorIndex(final int colorIndex) {
        this.colorIndex = colorIndex;
    }

    public boolean isExists() {
        return exists;
    }

    public void setGroup(final boolean group) {
        isGroup = group;
    }

    public void setExists(final boolean exists) {
        this.exists = exists;
    }

    public String toSysExUpdate(final int index) {
        int indexValue = index < 0 ? 0 : index;
        int highValue = (indexValue >> 7) & 0x7F;
        int lowValue = indexValue & 0x7F;
        return "F0 00 22 03 02 0A 07 %02X %02X %s%02X %02X F7".formatted(
            highValue, lowValue, midiString, colorIndex, isGroup ? 1 : 0);
    }

    public String toSysExUpdateSel(final int index) {
        int indexValue = index < 0 ? 0 : index;
        int highValue = (indexValue >> 7) & 0x7F;
        int lowValue = indexValue & 0x7F;
        return "F0 00 22 03 02 0C 04 %02X %02X %s%02X %02X F7".formatted(
            highValue, lowValue, midiString, colorIndex, isGroup ? 1 : 0);
    }

    public boolean exists() {
        return exists;
    }

}
