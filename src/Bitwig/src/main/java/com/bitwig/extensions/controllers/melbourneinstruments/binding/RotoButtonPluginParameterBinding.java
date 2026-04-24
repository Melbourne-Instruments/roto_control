package com.bitwig.extensions.controllers.melbourneinstruments.binding;

import com.bitwig.extensions.controllers.melbourneinstruments.control.RotoButton;
import com.bitwig.extensions.controllers.melbourneinstruments.device.RotoControlParameter;
import com.bitwig.extensions.framework.Binding;

public class RotoButtonPluginParameterBinding extends Binding<RotoButton, RotoControlParameter> {
    
    private int value;
    private long buttonChangeTime;
    
    public RotoButtonPluginParameterBinding(final RotoButton knob, final RotoControlParameter parameter) {
        super(knob, knob, parameter);
        knob.getHwKnob().value().addValueObserver(this::handleKnobValueChanged);
        parameter.getValue().addValueObserver(this::handleParameterValueChanged);
        parameter.getValue().addTriggerListener(this::handleDirectUpdate);
        parameter.getDisplayValue().addValueObserver(this::handleDisplayValue);
        value = (int) Math.round(parameter.getValue().get() * 127);
    }
    
    private void handleDisplayValue(String value) {
        if (isActive()) {
            final long diff = System.currentTimeMillis() - buttonChangeTime;
            if (diff < 100) {
                getSource().getMidiProcessor().placeParameterUpdate(true, getTarget().getIndex(), value);
            }
        }
    }
    
    private void handleDirectUpdate() {
        if (isActive()) {
            getSource().forceStateUpdate();
        }
    }
    
    private void handleParameterValueChanged(final double v) {
        value = (int) Math.round(v * 127.0);
        if (isActive()) {
            getSource().setLightState(value);
        }
    }
    
    private void handleKnobValueChanged(final double v) {
        if (isActive()) {
            buttonChangeTime = System.currentTimeMillis();
            getTarget().setDeviceValue(v);
        }
    }
    
    @Override
    protected void deactivate() {
    
    }
    
    @Override
    protected void activate() {
        getSource().setLightState(value);
        getSource().forceStateUpdate();
    }
}