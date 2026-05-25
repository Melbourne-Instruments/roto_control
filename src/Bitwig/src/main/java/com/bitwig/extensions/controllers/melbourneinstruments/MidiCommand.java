package com.bitwig.extensions.controllers.melbourneinstruments;

public class MidiCommand {
    
    private final byte[] data;
    private final int size;
    
    public MidiCommand(int commandTyp, int commandId, int payloadSize) {
        this.data = new byte[8 + payloadSize];
        this.size = payloadSize;
        this.data[0] = (byte) 0xF0;
        this.data[1] = 0x00;
        this.data[2] = 0x22;
        this.data[3] = 0x03;
        this.data[4] = 0x02;
        this.data[5] = (byte) commandTyp;
        this.data[6] = (byte) commandId;
        this.data[7 + payloadSize] = (byte) 0xf7;
    }
    
    public void setValue(int index, int value) {
        if (index < size) {
            this.data[7 + index] = (byte) value;
        }
    }
    
    public void setValue(int value) {
        this.data[7] = (byte) value;
    }
    
    public void setValue(int index, boolean value) {
        if (index < size) {
            this.data[7 + index] = (byte) (value ? 1 : 0);
        }
    }
    
    public byte[] getData() {
        return data;
    }
    
}
