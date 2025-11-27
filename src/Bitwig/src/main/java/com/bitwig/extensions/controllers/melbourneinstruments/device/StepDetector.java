package com.bitwig.extensions.controllers.melbourneinstruments.device;

import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import com.bitwig.extensions.controllers.melbourneinstruments.RotoControlExtension;
import com.bitwig.extensions.controllers.melbourneinstruments.StringUtil;

public class StepDetector {
    private final HashMap<Integer, String> rasterValues = new HashMap<>();
    private final Set<Double> distinctValues = new HashSet<>();

    private int currentRasterValue;
    private String paramId;
    private boolean expectDisplayValue = false;

    public void init(final String paramId) {
        rasterValues.clear();
        distinctValues.clear();
        this.paramId = paramId;
        expectDisplayValue = false;
    }

    public void setValue(final double value) {
        final int raster = (int) Math.round(value * LearnProcessor.STEPS);
        distinctValues.add(value);
        if (expectDisplayValue) {
            rasterValues.put(currentRasterValue, "%f".formatted(value));
        }
        currentRasterValue = raster;
        expectDisplayValue = true;
    }

    public void setValueString(final String valueString) {
        RotoControlExtension.println(" Match %s = %s",currentRasterValue, valueString);
        if (!rasterValues.containsKey(currentRasterValue)) {
            rasterValues.put(currentRasterValue, valueString);
        }
        expectDisplayValue = false;
    }

    public String getParamId() {
        return paramId;
    }

    public int getNrOfSteps() {
        return rasterValues.size();
    }

    public int getDistinctValues() {
        return distinctValues.size();
    }

    public List<String> getStepNames() {
        return rasterValues.keySet().stream().sorted().map(rasterValues::get).toList();
    }

    public List<String> getStepSysExNames() {
        return rasterValues.keySet().stream() //
            .sorted() //
            .map(rasterValues::get)//
            .map(StringUtil::nameToSysEx).toList();
    }

    public void registerCapture() {
        paramId = null;
        expectDisplayValue = false;
    }
}
