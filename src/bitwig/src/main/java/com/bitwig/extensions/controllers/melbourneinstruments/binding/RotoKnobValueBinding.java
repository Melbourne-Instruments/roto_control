package com.bitwig.extensions.controllers.melbourneinstruments.binding;

import com.bitwig.extensions.controllers.melbourneinstruments.control.RotoKnob;
import com.bitwig.extensions.controllers.melbourneinstruments.value.ValueProxy;
import com.bitwig.extensions.framework.Binding;

public class RotoKnobValueBinding extends Binding<RotoKnob, ValueProxy> {
    
    private int lowValue;
    private int highValue;
    private long knobChangeTime;
    private boolean exists;
    
    public RotoKnobValueBinding(final RotoKnob knob, final ValueProxy parameter) {
        super(knob, knob, parameter);
        knob.getKnobValue().addValueObserver(this::handleKnobValueChanged);
        parameter.addValueObserver(this::handleParameterValueChanged);
        updateValues(parameter.get());
        knob.getTouchButton().isPressed().addValueObserver(this::handleTouched);
    }
    
    private void handleTouched(final boolean touched) {
        if (isActive()) {
            getTarget().touched(touched);
        }
    }
    
    private void updateValues(final double v) {
        final int value = (int) Math.round(v * 16383.0);
        this.lowValue = value & 0x7F;
        this.highValue = value >> 7;
    }
    
    private void handleParameterValueChanged(final double v) {
        updateValues(v);
        if (isActive()) {
            final RotoKnob knob = getSource();
            knob.updateBytes(lowValue, highValue);
            final long diff = System.currentTimeMillis() - knobChangeTime;
            if (diff > 100) {
                knob.updatePosition(false);
            }
        }
    }
    
    private void handleKnobValueChanged(final double v) {
        if (isActive()) {
            knobChangeTime = System.currentTimeMillis();
            this.lowValue = getSource().getLowValue();
            this.highValue = getSource().getHighValue();
            getTarget().set(v);
        }
    }
    
    
    @Override
    protected void deactivate() {
        getTarget().touched(false);
    }
    
    @Override
    protected void activate() {
        final RotoKnob knob = getSource();
        knob.updateBytes(lowValue, highValue);
        knob.setActive(true);
        knob.updatePosition(true);
    }
}
