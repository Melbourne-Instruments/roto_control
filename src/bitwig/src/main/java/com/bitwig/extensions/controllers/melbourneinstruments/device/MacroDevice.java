package com.bitwig.extensions.controllers.melbourneinstruments.device;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

import com.bitwig.extension.controller.api.CursorRemoteControlsPage;
import com.bitwig.extension.controller.api.Parameter;
import com.bitwig.extensions.controllers.melbourneinstruments.StringUtil;

public class MacroDevice {
    private static final String MACRO_DEVICE_NAME = "MIMacroDefaultDevice";
    
    private final List<RotoMacroParameter> rotoParameters = new ArrayList<>();
    private final String sysExHash;
    private final String refHash;
    private int remotePages = 0;
    private int remotePageIndex = 0;
    private final CursorRemoteControlsPage remotes;
    
    public MacroDevice(final CursorRemoteControlsPage remotes) {
        this.remotes = remotes;
        final List<String> hashList = StringUtil.createHash(MACRO_DEVICE_NAME, 8);
        this.sysExHash = hashList.stream().collect(Collectors.joining(" "));
        this.refHash = hashList.stream().collect(Collectors.joining(""));
        remotes.selectedPageIndex().addValueObserver(this::setRemotePageIndex);
        for (int i = 0; i < 8; i++) {
            rotoParameters.add(new RotoMacroParameter(i, "Macro %d".formatted(i + 1)));
        }
    }
    
    public void selectRemotePageIndex(final int pageIndex) {
        this.remotes.selectedPageIndex().set(pageIndex);
    }
    
    public RotoMacroParameter getItem(final int index) {
        return rotoParameters.get(index);
    }
    
    public List<RotoMacroParameter> getRotoParameters() {
        return rotoParameters;
    }
    
    public Parameter getRemoteParameter(final int index) {
        return this.remotes.getParameter(index);
    }
    
    public void setRemotePages(final int remotePages) {
        this.remotePages = Math.max(0, remotePages);
    }
    
    public int getRemotePages() {
        return remotePages;
    }
    
    public void setRemotePageIndex(final int remotePageIndex) {
        this.remotePageIndex = Math.max(0, remotePageIndex);
    }
    
    public int getRemotePageIndex() {
        return remotePageIndex;
    }
    
    public boolean scrollInPlace() {
        return remotePageIndex == this.remotes.selectedPageIndex().get();
    }
    
    public String getSysExHash() {
        return sysExHash;
    }
    
    
    public Optional<RotoParameter> getParameter(final int index) {
        if (index > 0 && index <= rotoParameters.size()) {
            final RotoMacroParameter param = rotoParameters.get(index - 1);
            //RotoControlExtension.println(" :: %d == %s   <= %s", index, param.getRefHash(), param.getCurrentName());
            return Optional.of(param);
        }
        return Optional.empty();
    }
    
    
}
