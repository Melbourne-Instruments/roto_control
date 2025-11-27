package com.bitwig.extensions.controllers.melbourneinstruments.binding;

import com.bitwig.extension.controller.api.BooleanValue;
import com.bitwig.extension.controller.api.SettableIntegerValue;
import com.bitwig.extensions.framework.Binding;

public class BooleanToIntegerBinding extends Binding<BooleanValue, SettableIntegerValue> {
    
    private int value;
    
    public BooleanToIntegerBinding(final BooleanValue source, final SettableIntegerValue target) {
        super(source, target);
        source.addValueObserver(onOff -> {
            this.value = onOff ? 127 : 0;
            if (isActive()) {
                target.set(this.value);
            }
        });
    }
    
    @Override
    protected void deactivate() {
    
    }
    
    @Override
    protected void activate() {
        this.value = getSource().get() ? 127 : 0;
        getTarget().set(this.value);
    }
}
