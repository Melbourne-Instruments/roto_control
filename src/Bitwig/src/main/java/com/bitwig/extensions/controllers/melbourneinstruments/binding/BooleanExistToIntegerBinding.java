package com.bitwig.extensions.controllers.melbourneinstruments.binding;

import com.bitwig.extension.controller.api.BooleanValue;
import com.bitwig.extension.controller.api.SettableIntegerValue;
import com.bitwig.extensions.framework.Binding;

public class BooleanExistToIntegerBinding extends Binding<BooleanValue, SettableIntegerValue> {

    private boolean value;
    private boolean exists;

    public BooleanExistToIntegerBinding(final BooleanValue source, final SettableIntegerValue target,
        final BooleanValue existValue) {
        super(source, target);
        this.exists = existValue.get();
        this.value = source.get();
        existValue.addValueObserver(exists -> {
            this.exists = exists;
            if (isActive()) {
                target.set(calcValue());
            }
        });
        source.addValueObserver(onOff -> {
            this.value = onOff;
            if (isActive()) {
                target.set(calcValue());
            }
        });
    }

    private int calcValue() {
        if (!this.exists) {
            return 0x00;
        }
        return value ? 0x7F : 0x00;
    }

    @Override
    protected void deactivate() {
    }

    @Override
    protected void activate() {
        getTarget().set(calcValue());
    }
}
