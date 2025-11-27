package com.bitwig.extensions.controllers.melbourneinstruments.device;

import java.util.List;
import java.util.stream.Collectors;

import com.bitwig.extensions.controllers.melbourneinstruments.StringUtil;

public class RotoParameter {
    private final String id;
    private final String fullId;
    private String name;
    protected int index;
    protected boolean centerDetent = false;

    protected final String sysExHash;
    private final String refHash;
    protected String sysExName;

    private boolean isLearned;
    protected int steps = 0;
    protected double value;

    protected final boolean isMacro;

    public RotoParameter(final int index, final String fullId, final boolean isMacro) {
        this.index = index;
        this.id = getLastSegment(fullId);
        this.fullId = fullId;
        this.isMacro = isMacro;

        final List<String> hashList = StringUtil.createHash(fullId, 6);
        this.sysExHash = hashList.stream().collect(Collectors.joining(" "));
        this.refHash = hashList.stream().collect(Collectors.joining(""));
    }

    public String getName() {
        return name;
    }

    public boolean exists() {
        return true;
    }

    public void setName(final String name) {
        this.sysExName = StringUtil.nameToSysEx(name);
        this.name = name;
    }

    public void setCenterDetent(final boolean centerDetent) {
        this.centerDetent = centerDetent;
    }

    public int getIndex() {
        return index;
    }

    public void setIndex(final int index) {
        this.index = index;
    }

    public String getFullId() {
        return fullId;
    }

    public String getId() {
        return id;
    }

    public String getRefHash() {
        return refHash;
    }

    public void setSteps(final int steps) {
        this.steps = steps;
    }

    public String getDisplayName() {
        return sysExName;
    }

    public String getSysExNameChange() {
        return "F0 00 22 03 02 0B 0F %02X %02X %s %sF7".formatted(0, index + 1, sysExHash, getDisplayName());
    }

    public String getSysExName(final String value) {
        return "F0 00 22 03 02 0B 0F %02X %02X %s %sF7".formatted(
            0, index + 1, sysExHash, StringUtil.nameToSysEx(value));
    }

    public String getSysExValueString(final String value) {
        return "F0 00 22 03 02 0A 0F %02X %02X %sF7".formatted(0, index, StringUtil.nameToSysEx(value));
    }

    public String getLearnSysEx() {
        final int parameterPos = (int) Math.round(value * 16383);
        return "F0 00 22 03 02 0B 0A %02X %02X %s %02X %02X %02X %02X %02X %sF7".formatted(index >> 7, index & 0x7F,
            sysExHash, isMacro ? 1 : 0, centerDetent ? 1 : 0, steps == -1 ? 0 : steps, parameterPos >> 7,
            parameterPos & 0x7F, sysExName
        );
    }

    public String getLearnSysEx(final List<String> stepNames) {
        final int parameterPos = (int) Math.round(value * 16383);
        if (stepNames.size() > 16) {
            return "F0 00 22 03 02 0B 0A %02X %02X %s %02X %02X %02X %02X %02X %sF7".formatted(index >> 7, index & 0x7F,
                sysExHash, isMacro ? 1 : 0, centerDetent ? 1 : 0, steps == -1 ? 0 : steps, parameterPos >> 7,
                parameterPos & 0x7F, sysExName
            );
        }
        return "F0 00 22 03 02 0B 0A %02X %02X %s %02X %02X %02X %02X %02X %s%sF7".formatted(index >> 7, index & 0x7F,
            sysExHash, isMacro ? 1 : 0, centerDetent ? 1 : 0, steps == -1 ? 0 : steps, parameterPos >> 7,
            parameterPos & 0x7F, sysExName, stepNames.stream().collect(Collectors.joining(""))
        );
    }

    public static String getLastSegment(final String path) {
        final int lastSlashIndex = path.lastIndexOf('/');
        return (lastSlashIndex == -1) ? path : path.substring(lastSlashIndex + 1);
    }

    public void setLearned(final boolean learned) {
        isLearned = learned;
    }

    public boolean isLearned() {
        return isLearned;
    }

    public void setValue(final double value) {
        this.value = value;
    }

    public double getValue() {
        return value;
    }

}
