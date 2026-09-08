package com.bitwig.extensions.controllers.melbourneinstruments.device;

import com.bitwig.extension.controller.api.CursorDevice;
import com.bitwig.extensions.controllers.melbourneinstruments.value.TriggeredDoubleValue;
import com.bitwig.extensions.framework.values.BasicStringValue;

public class RotoControlParameter {
    private final int index;
    private RotoParameter parameter;
    private final TriggeredDoubleValue value = new TriggeredDoubleValue();
    private final BasicStringValue displayValue = new BasicStringValue();
    private final CursorDevice device;

    public RotoControlParameter(final int index, final CursorDevice device) {
        this.index = index;
        this.device = device;
    }

    public int getIndex() {
        return index;
    }


    public String getParamId() {
        return parameter != null ? parameter.getId() : "";
    }

    public void setDeviceValue(final double value) {
        if (parameter != null) {
            device.setDirectParameterValueNormalized(parameter.getFullId(), value, 1.0);
        }
    }

    public String getName() {
        if (parameter != null) {
            return parameter.getName();
        }
        return "no-param";
    }

    public RotoParameter getParameter() {
        return parameter;
    }


    public void setParameter(final RotoParameter parameter) {
        this.parameter = parameter;
        value.set(parameter.getValue());
        value.triggerUpdate();
    }

    public TriggeredDoubleValue getValue() {
        return value;
    }

    public BasicStringValue getDisplayValue() {
        return displayValue;
    }

    public void setDisplayValue(final String value) {
        this.displayValue.set(value);
    }
}
