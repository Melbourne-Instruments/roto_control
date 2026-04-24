package com.bitwig.extensions.controllers.melbourneinstruments.value;

import com.bitwig.extensions.controllers.melbourneinstruments.StringUtil;

public record ParamUpdate(int index, String value) {
    
    public byte[] getParamUpdate() {
        final byte[] result = new byte[19];
        result[0] = (byte) 0xF0;
        result[1] = (byte) 0x00;
        result[2] = (byte) 0x22;
        result[3] = (byte) 0x03;
        result[4] = (byte) 0x02;
        result[5] = (byte) 0x0A;
        result[6] = (byte) 0x18;
        result[7] = (byte) 0x01;
        result[8] = (byte) index;
        final String text = StringUtil.toAsciiDisplay(value, 12);
        for (int i = 0; i < 13; i++) {
            result[i + 9] = i < text.length() ? (byte) text.charAt(i) : 0x00;
        }
        result[22] = (byte) 0xF7;
        return result;
    }
    
}
