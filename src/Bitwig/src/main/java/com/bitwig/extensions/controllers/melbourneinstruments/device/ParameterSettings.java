package com.bitwig.extensions.controllers.melbourneinstruments.device;

import com.bitwig.extensions.controllers.melbourneinstruments.RotoControlExtension;
import static com.bitwig.extensions.controllers.melbourneinstruments.MidiProcessor.getSysExBlock;
import static com.bitwig.extensions.controllers.melbourneinstruments.MidiProcessor.getSysExValue;

public record ParameterSettings(int index, String hashValue, int controlType, int pageIndex, boolean isMacro) {
    
    public static ParameterSettings fromData(final String data) {
        try {
            final String idx = getSysExBlock(4, 2, data);
            final int high = Integer.parseInt(idx.substring(0, 2), 16);
            final int low = Integer.parseInt(idx.substring(2, 4), 16);
            final String hash = getSysExBlock(8, 6, data);
            final int control = getSysExValue(20, data);
            final int page = getSysExValue(22, data);
            final int isMacro = getSysExValue(24, data);
            return new ParameterSettings(high << 7 | low, hash, control, page, isMacro == 1);
        }
        catch (final StringIndexOutOfBoundsException exc) {
            RotoControlExtension.println("Parameter Data Corrupted %s  .Parsing failed", data);
            throw exc;
        }
    }
}
