package com.bitwig.extensions.controllers.melbourneinstruments.device;

public class DeviceState {
    private boolean exists;
    private boolean enabled;
    private int index;
    private DeviceParameterSet parameterSet;
    private boolean inMacroMode = false;
    private int pages = 1;
    private boolean isPlugin;
    
    public DeviceState(final int index) {
        this.index = index;
    }
    
    public void setIndex(final int index) {
        this.index = index < 0 ? 0 : index;
    }
    
    public void setExists(final boolean exists) {
        this.exists = exists;
    }
    
    public void setPages(final int pages) {
        this.pages = pages;
    }
    
    public void setInMacroMode(final boolean inMacroMode) {
        this.inMacroMode = inMacroMode;
    }
    
    public int getIndex() {
        return index;
    }
    
    public boolean isEnabled() {
        return enabled;
    }
    
    public void setPlugin(final boolean plugin) {
        isPlugin = plugin;
    }
    
    public boolean isPlugin() {
        return isPlugin;
    }
    
    public boolean isInMacroMode() {
        return inMacroMode;
    }
    
    public String getName() {
        if (parameterSet != null) {
            return parameterSet.getName();
        }
        return "";
    }
    
    public String getSysExName() {
        if (parameterSet != null) {
            return parameterSet.getSysExName();
        }
        return "";
    }
    
    public void setEnabled(final boolean enabled) {
        this.enabled = enabled;
    }
    
    public boolean exists() {
        return exists;
    }
    
    public void setParameterSet(final DeviceParameterSet parameterSet) {
        this.parameterSet = parameterSet;
    }
    
    public String toSysExUpdate(final int slotIndex) {
        if (this.parameterSet != null) {
            return "F0 00 22 03 02 0B 05 %02X %s %02X %s%02X %02X F7".formatted(
                slotIndex, parameterSet.getSysExHash(),
                enabled ? 1 : 0, parameterSet.getSysExName(), inMacroMode ? 1 : 0, pages);
        }
        return null;
    }
    
}
