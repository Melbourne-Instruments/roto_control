package com.bitwig.extensions.controllers.melbourneinstruments.binding;

import com.bitwig.extension.controller.api.Parameter;
import com.bitwig.extensions.controllers.melbourneinstruments.control.RotoKnob;
import com.bitwig.extensions.controllers.melbourneinstruments.device.RotoMacroParameter;
import com.bitwig.extensions.framework.Binding;
import com.bitwig.extensions.framework.values.BooleanValueObject;

public class RotoKnobParameterBinding extends Binding<RotoKnob, Parameter> {
    
    private int lowValue;
    private int highValue;
    private long knobChangeTime;
    private long touchRelease;
    private boolean exists;
    private boolean touched;
    private final RotoMacroParameter macroParameter;
    private String displayValue;
    private final BooleanValueObject touchAutomationActive;
    
    public RotoKnobParameterBinding(final RotoKnob knob, final Parameter parameter,
        final RotoMacroParameter macroParameter, final BooleanValueObject touchAutomationActive) {
        super(knob, knob, parameter);
        this.touchAutomationActive = touchAutomationActive;
        parameter.name().markInterested();
        knob.getKnobValue().addValueObserver(this::handleKnobValueChanged);
        parameter.value().addValueObserver(this::handleParameterValueChanged);
        parameter.exists().addValueObserver(this::handleExists);
        updateValues(parameter.value().get());
        knob.getTouchButton().isPressed().addValueObserver(this::handleTouched);
        this.macroParameter = macroParameter;
        if (this.macroParameter != null) {
            parameter.displayedValue().addValueObserver(this::handleDisplayChanged);
        }
    }
    
    public RotoKnobParameterBinding(final RotoKnob knob, final Parameter parameter,
        final BooleanValueObject touchAutomationActive) {
        this(knob, parameter, null, touchAutomationActive);
    }
    
    private void handleDisplayChanged(final String s) {
        this.displayValue = s;
        if (isActive()) {
            final long diff = System.currentTimeMillis() - knobChangeTime;
            if (diff < 300) {
                getSource().updateDisplayValue(macroParameter.getSysExValueString(displayValue));
            }
        }
    }
    
    private void resetName() {
        if (isActive()) {
            getSource().updateDisplayValue(macroParameter.getSysExNameChange());
        }
    }
    
    private void handleTouched(final boolean touched) {
        if (isActive()) {
            this.touched = touched;
            getTarget().touch(touched);
            if (!touched) {
                knobChangeTime = System.currentTimeMillis();
                touchRelease = knobChangeTime;
            } else {
                touchRelease = -1;
            }
        }
    }
    
    private boolean updateValues(final double v) {
        final int value = (int) Math.round(v * 16383.0);
        final int newLow = value & 0x7F;
        final int newHigh = value >> 7;
        if (newLow != lowValue || newHigh != highValue) {
            this.lowValue = newLow;
            this.highValue = newHigh;
            return true;
        }
        return false;
    }
    
    private void handleExists(final boolean exists) {
        this.exists = exists;
        if (isActive()) {
            getSource().setActive(exists);
        }
    }
    
    private void handleParameterValueChanged(final double v) {
        if (updateValues(v) && isActive()) {
            final RotoKnob knob = getSource();
            
            knob.updateBytes(lowValue, highValue);
            //final long diff = System.currentTimeMillis() - knobChangeTime;
            //if (diff > 100 && !touched) {
            knob.updatePosition(false);
            //}
        }
    }
    
    private void handleKnobValueChanged(final double v) {
        if (isActive()) {
            knobChangeTime = System.currentTimeMillis();
            this.lowValue = getSource().getLowValue();
            this.highValue = getSource().getHighValue();
            if (touchRelease != -1 && touchAutomationActive.get()
                && (System.currentTimeMillis() - touchRelease) < 500) {
                //RotoControlExtension.println(" Deflect Auto %d", (System.currentTimeMillis() - touchRelease));
                return;
            }
            //RotoControlExtension.println(" Value %f", v);
            //getTarget().value().set(v);
            getTarget().value().setImmediately(v);
        }
    }
    
    @Override
    protected void deactivate() {
        getTarget().touch(false);
        touched = false;
        touchRelease = -1;
    }
    
    @Override
    protected void activate() {
        final RotoKnob knob = getSource();
        updateValues(getTarget().get());
        knob.setActive(exists);
        knob.updatePosition(true);
        knob.updateBytes(lowValue, highValue);
    }
}
