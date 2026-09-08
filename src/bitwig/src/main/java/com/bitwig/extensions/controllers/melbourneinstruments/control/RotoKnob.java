package com.bitwig.extensions.controllers.melbourneinstruments.control;

import com.bitwig.extension.controller.api.HardwareButton;
import com.bitwig.extension.controller.api.HardwareSurface;
import com.bitwig.extension.controller.api.SettableDoubleValue;
import com.bitwig.extensions.controllers.melbourneinstruments.MidiProcessor;
import com.bitwig.extensions.framework.values.BasicDoubleValue;

public class RotoKnob {
    private final int midiBase;
    private final int index;
    private int lowValue;
    private int highValue;
    private final BasicDoubleValue knobValue = new BasicDoubleValue();
    private final MidiProcessor midiProcessor;
    private boolean active;
    private final HardwareButton touchButton;
    
    private int lastSentLow = -1;
    private int lastSentHigh = -1;
    
    public RotoKnob(final int index, final HardwareSurface surface, final MidiProcessor midiProcessor) {
        this.midiBase = index + 0xC;
        this.index = index;
        this.midiProcessor = midiProcessor;
        midiProcessor.setCcKnobMatcher(this);
        this.touchButton = surface.createHardwareButton("TOUCH_%d".formatted(index + 1));
        midiProcessor.setCcMatcher(this.touchButton, 0x34 + index);
        this.touchButton.isPressed().markInterested();
    }
    
    public void setActive(final boolean active) {
        this.active = active;
    }
    
    public int getMidiBase() {
        return midiBase;
    }
    
    public int getIndex() {
        return index;
    }
    
    public int getLowValue() {
        return lowValue;
    }
    
    public int getHighValue() {
        return highValue;
    }
    
    public void setHighByteValue(final int value) {
        this.highValue = value;
    }
    
    public void updateBytes(final int low, final int highValue) {
        this.lowValue = low;
        this.highValue = highValue;
    }
    
    public void setLowValue(final int lowValue) {
        this.lowValue = lowValue;
        final int value = lowValue | (highValue << 7);
        knobValue.setForce(Math.min(1, value / 16382.0));
    }
    
    public HardwareButton getTouchButton() {
        return touchButton;
    }
    
    public SettableDoubleValue getKnobValue() {
        return knobValue;
    }
    
    public void updatePosition(final boolean force) {
        if (active) {
            if (force || lastSentHigh != highValue || lastSentLow != lowValue) {
                midiProcessor.sendCCHiRes(midiBase, highValue, lowValue);
                lastSentLow = lowValue;
                lastSentHigh = highValue;
            }
        }
    }
    
    public void updateDisplayValue(final String sysExName) {
        midiProcessor.sendSysEx(sysExName);
    }
    
}
