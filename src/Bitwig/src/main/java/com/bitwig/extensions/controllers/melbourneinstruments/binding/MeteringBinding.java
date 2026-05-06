package com.bitwig.extensions.controllers.melbourneinstruments.binding;

import com.bitwig.extensions.controllers.melbourneinstruments.MidiProcessor;
import com.bitwig.extensions.framework.Binding;

public abstract class MeteringBinding<Source> extends Binding<Source, MidiProcessor> {
    public static final int METERING_MAX = 115;
    
    private int leftValue = 0;
    private int rightValue = 0;
    
    public MeteringBinding(int index, final Source source, final MidiProcessor target) {
        super(source, target);
        this.index = index;
    }
    
    protected void handleMeterRight(int value) {
        int adjustValue = value == METERING_MAX ? 127 : value;
        if (adjustValue != this.rightValue) {
            this.rightValue = adjustValue;
            if (isActive()) {
                getTarget().updateMeterRight(index, adjustValue);
            }
        }
        
    }
    
    protected void handleMeterLeft(int value) {
        int adjustValue = value == METERING_MAX ? 127 : value;
        if (adjustValue != this.leftValue) {
            this.leftValue = adjustValue;
            if (isActive()) {
                getTarget().updateMeterLeft(index, adjustValue);
            }
        }
    }
    
    @Override
    protected void deactivate() {
    
    }
    
    @Override
    protected void activate() {
        getTarget().setMeter(index, leftValue, rightValue);
    }
    
    protected final int index;
}
