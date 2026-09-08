package com.bitwig.extensions.framework.values;

import java.util.ArrayList;
import java.util.List;
import java.util.function.IntConsumer;

public class IntValueObject implements IncrementalValue {
    private final List<IntConsumer> callbacks = new ArrayList<>();
    private int value;
    private final int min;
    private final int max;
    private final Converter converter;
    
    @FunctionalInterface
    public interface Converter {
        String convert(int value);
    }
    
    public IntValueObject(final int initValue, final int min, final int max) {
        this.value = initValue;
        this.min = min;
        this.max = max;
        this.converter = null;
    }
    
    public IntValueObject(final int initValue, final int min, final int max, final Converter converter) {
        this.value = initValue;
        this.min = min;
        this.max = max;
        this.converter = converter;
    }
    
    public int getMax() {
        return max;
    }
    
    public void addValueObserver(final IntConsumer callback) {
        if (!callbacks.contains(callback)) {
            callbacks.add(callback);
        }
    }
    
    @Override
    public void increment(final int amount) {
        final int newValue = Math.max(min, Math.min(max, value + amount));
        this.set(newValue);
    }
    
    public void set(final int value) {
        final int newValue = Math.min(max, value);
        if (this.value == newValue) {
            return;
        }
        final int oldValue = this.value;
        this.value = newValue;
        for (final IntConsumer listener : callbacks) {
            listener.accept(value);
        }
    }
    
    public int get() {
        return value;
    }
    
    @Override
    public String displayedValue() {
        if (converter != null) {
            return converter.convert(value);
        }
        return Integer.toString(value);
    }
    
}
