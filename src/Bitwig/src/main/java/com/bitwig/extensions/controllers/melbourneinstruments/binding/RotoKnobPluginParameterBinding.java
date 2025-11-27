package com.bitwig.extensions.controllers.melbourneinstruments.binding;

import com.bitwig.extensions.controllers.melbourneinstruments.StringUtil;
import com.bitwig.extensions.controllers.melbourneinstruments.control.RotoKnob;
import com.bitwig.extensions.controllers.melbourneinstruments.device.RotoControlParameter;
import com.bitwig.extensions.controllers.melbourneinstruments.device.RotoParameter;
import com.bitwig.extensions.framework.Binding;

public class RotoKnobPluginParameterBinding extends Binding<RotoKnob, RotoControlParameter> {
    
    private int lowValue;
    private int highValue;
    private long knobChangeTime;
    
    public RotoKnobPluginParameterBinding(final RotoKnob knob, final RotoControlParameter parameter) {
        super(knob, knob, parameter);
        knob.getKnobValue().addValueObserver(this::handleKnobValueChanged);
        parameter.getValue().addValueObserver(this::handleParameterValueChanged);
        parameter.getValue().addTriggerListener(this::handleUpdate);
        parameter.getDisplayValue().addValueObserver(this::handleDisplayValue);
        updateValues(parameter.getValue().get());
    }
    
    private void handleDisplayValue(final String value) {
        if (isActive()) {
            final long diff = System.currentTimeMillis() - knobChangeTime;
            if (diff < 100) {
                getSource().updateDisplayValue(getSysExValueString(value));
            }
        }
    }
    
    public String getSysExValueString(final String value) {
        return "F0 00 22 03 02 0A 0F %02X %02X %sF7".formatted(
            0, getTarget().getIndex(), StringUtil.nameToSysEx(value));
    }
    
    private void handleUpdate() {
        if (isActive()) {
            getSource().updatePosition(false);
        }
    }
    
    private void updateValues(final double v) {
        final int value = (int) Math.round(v * 16383.0);
        this.lowValue = value & 0x7F;
        this.highValue = value >> 7;
    }
    
    private void handleKnobValueChanged(final double v) {
        if (isActive()) {
            knobChangeTime = System.currentTimeMillis();
            this.lowValue = getSource().getLowValue();
            this.highValue = getSource().getHighValue();
            getTarget().setDeviceValue(v);
        }
    }
    
    private void handleParameterValueChanged(final double v) {
        if (isActive()) {
            updateValues(v);
            final RotoKnob knob = getSource();
            knob.updateBytes(lowValue, highValue);
            //final long diff = System.currentTimeMillis() - knobChangeTime;
            //if (diff > 100) {
            knob.updatePosition(false);
            //}
        }
    }
    
    @Override
    protected void deactivate() {
    }
    
    @Override
    protected void activate() {
        final RotoKnob knob = getSource();
        final RotoParameter param = getTarget().getParameter();
        if (param != null) {
            updateValues(param.getValue());
        }
        knob.updateBytes(lowValue, highValue);
        knob.setActive(true);
        knob.updatePosition(true);
    }
    
}
