package com.bitwig.extensions.controllers.melbourneinstruments.device;

import java.util.ArrayList;
import java.util.List;

import com.bitwig.extensions.controllers.melbourneinstruments.StringUtil;

public class RotoMacroParameter extends RotoParameter {
    private static final String EMPTY_STEP = StringUtil.nameToSysEx("");
    private boolean exists = true;
    private String sysExCurrentName;
    private final List<String> stepNames = new ArrayList<>();
    
    public RotoMacroParameter(final int index, final String name) {
        super(index, name, true);
        setName(name);
    }
    
    public void setCurrentName(final String currentName) {
        this.sysExCurrentName = StringUtil.nameToSysEx(currentName);
    }
    
    public void setExists(final boolean exists) {
        this.exists = exists;
    }
    
    @Override
    public boolean exists() {
        return exists;
    }
    
    public void setSteps(final int steps) {
        stepNames.clear();
        if (steps <= 0 || steps > 0x2A) {
            super.setSteps(0);
        } else {
            super.setSteps(steps);
            for (int i = 0; i < steps; i++) {
                stepNames.add(EMPTY_STEP);
            }
            
        }
    }
    
    public String getDisplayName() {
        return sysExCurrentName;
    }
    
    
    public String getSysExUnmap() {
        return "F0 00 22 03 02 0B 0E 01 %02X F7".formatted(index);
    }
    
    public String getLearnSysEx() {
        final int parameterPos = (int) Math.round(value * 16383);
        return "F0 00 22 03 02 0B 0A %02X %02X %s %02X %02X %02X %02X %02X %sF7".formatted(
            0, index + 1, sysExHash, 1,
            centerDetent ? 1 : 0, steps == -1 ? 0 : steps, parameterPos >> 7, parameterPos & 0x7F, getDisplayName());
    }
    
    
}
