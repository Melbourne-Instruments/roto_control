package com.bitwig.extensions.controllers.melbourneinstruments.device;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.stream.Collectors;

import com.bitwig.extensions.controllers.melbourneinstruments.RotoControlExtension;
import com.bitwig.extensions.controllers.melbourneinstruments.StringUtil;

public class DeviceParameterSet {
    
    // Maps ID to Parameter Object
    private final HashMap<String, RotoParameter> pidParameterLookup = new HashMap<>();
    // Maps hash to Parameter object
    private final HashMap<String, RotoParameter> hashToParameter = new HashMap<>();
    private final String name;
    private final String sysExName;
    private final String sysExHash;
    private boolean parameterRegistered;
    private String[] allIds;
    private boolean isPlugin;
    private final List<ParameterSettings> stashedRequestedParameters = new ArrayList<>();
    
    public DeviceParameterSet(final String name, final boolean isPlugin) {
        this.name = name;
        this.isPlugin = isPlugin;
        //RotoControlExtension.println("CREATE %s  => %s", name, isPlugin);
        this.sysExName = StringUtil.toSysExName(name);
        this.sysExHash = StringUtil.createHash(name, 8).stream().collect(Collectors.joining(" "));
        //RotoControlExtension.println(" <%s> => %s ", name, sysExHash);
    }
    
    public String getName() {
        return name;
    }
    
    public String getSysExHash() {
        return sysExHash;
    }
    
    public String getSysExName() {
        return sysExName;
    }
    
    public void registerParameterIds(final String[] ids) {
        if (parameterRegistered || ids.length == 0) {
            return;
        }
        // RotoControlExtension.println(" INCOMING (%s) PARAM BLOCK %d", name, ids.length);
        if (isPlugin) {
            allIds = Arrays.stream(ids).map(id -> id.replaceFirst("CONTENTS/", "CONTENTS/ROOT_GENERIC_MODULE/"))
                .toArray(String[]::new);
        } else {
            allIds = ids;
        }
        //RotoControlExtension.println(" PIDS %s %s", name, isPlugin);
        for (int index = 0; index < ids.length; index++) {
            final String id = ids[index];
            final String pid = getLastSegment(id);
            final RotoParameter parameter = new RotoParameter(index, id, false);
            pidParameterLookup.put(pid, parameter);
            hashToParameter.put(parameter.getRefHash(), parameter);
        }
        parameterRegistered = true;
    }
    
    public List<ParameterSettings> getStashedRequestedParameters() {
        return stashedRequestedParameters;
    }
    
    public void clearParameterRequestStash() {
        stashedRequestedParameters.clear();
    }
    
    public void registerName(final String id, final String name) {
        final String pid = getLastSegment(id);
        final RotoParameter parameter = pidParameterLookup.get(pid);
        if (parameter != null) {
            parameter.setName(name);
        } else {
            RotoControlExtension.println("<%s> PID %s name=%s  not registered", pid, name, this.name);
            // TODO In case parameters come later
        }
    }
    
    public static String getLastSegment(final String path) {
        final int lastSlashIndex = path.lastIndexOf('/');
        return lastSlashIndex == -1 ? path : path.substring(lastSlashIndex + 1);
    }
    
    public RotoParameter getParameter(final String pid) {
        return pidParameterLookup.get(pid);
    }
    
    public RotoParameter getParameterByHash(final String hash) {
        return hashToParameter.get(hash);
    }
    
    public void clearLearned() {
        pidParameterLookup.values().forEach(param -> param.setLearned(false));
    }
    
    public String[] getParameters() {
        return allIds;
    }
    
    public void registerPluginState(final boolean isPlugin) {
        if (this.isPlugin != isPlugin) {
            this.isPlugin = isPlugin;
        }
    }
    
    public void stashMissingParam(final ParameterSettings settings) {
        //RotoControlExtension.println(" <%s> Parameter %s not found !!!! ", name, settings);
        stashedRequestedParameters.add(settings);
    }
}
