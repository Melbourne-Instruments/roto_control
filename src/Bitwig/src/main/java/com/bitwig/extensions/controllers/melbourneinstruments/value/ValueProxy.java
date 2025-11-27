package com.bitwig.extensions.controllers.melbourneinstruments.value;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;
import java.util.function.DoubleConsumer;

public class ValueProxy {
    
    private double value = 0;
    private boolean touch = false;
    private final List<DoubleConsumer> listeners = new ArrayList<>();
    private final List<Consumer<Boolean>> touchListeners = new ArrayList<>();
    
    public double get() {
        return value;
    }
    
    public void set(final double v) {
        if (this.value != v) {
            this.value = v;
            listeners.stream().forEach(listener -> listener.accept(this.value));
        }
    }
    
    public void addValueObserver(final DoubleConsumer listener) {
        listeners.add(listener);
    }
    
    public void addValueObserver(final Consumer<Boolean> listener) {
        touchListeners.add(listener);
    }
    
    public void touched(final boolean touched) {
        if (this.touch != touched) {
            this.touch = touched;
            touchListeners.stream().forEach(listener -> listener.accept(this.touch));
        }
    }
}
