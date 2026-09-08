package com.bitwig.extensions.controllers.melbourneinstruments.value;

import java.util.ArrayList;
import java.util.List;

import com.bitwig.extensions.framework.values.BasicDoubleValue;

public class TriggeredDoubleValue extends BasicDoubleValue {

    private List<Runnable> triggerListeners = new ArrayList<>();

    public void addTriggerListener(Runnable action) {
        triggerListeners.add(action);
    }

    public void triggerUpdate() {
        triggerListeners.forEach(Runnable::run);
    }

}
