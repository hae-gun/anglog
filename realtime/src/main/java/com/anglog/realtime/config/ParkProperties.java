package com.anglog.realtime.config;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/** Settings under "angpark" (application.yml). Every limit in the protocol lives here. */
@ConfigurationProperties(prefix = "angpark")
public record ParkProperties(
        @DefaultValue("1") int protocolVersion,
        @DefaultValue({"http://localhost:5173", "http://localhost:4173"}) List<String> allowedOrigins,
        @DefaultValue("50") int channelCapacity,
        @DefaultValue("200") long presenceMs,
        @DefaultValue("150") long moveMinGapMs,
        @DefaultValue("10000") long heartbeatMs,
        @DefaultValue("30000") long heartbeatTimeoutMs,
        @DefaultValue("10000") long helloTimeoutMs,
        @DefaultValue("20") int maxConnectionsPerIp,
        @DefaultValue("2048") int maxMessageBytes,
        @DefaultValue("2000") long lookMinGapMs,
        @DefaultValue("1500") long sayMinGapMs,
        @DefaultValue("600") long emoteMinGapMs,
        @DefaultValue("12") int phraseCount,
        @DefaultValue("") String blockedWordsFile,
        @DefaultValue("60") double worldLimit,
        @DefaultValue("12") double heightLimit,
        // pranks: how close, how often, how long an answer may wait, and how a target says "enough"
        @DefaultValue("3.2") double prankRange,
        @DefaultValue("700") long prankMinGapMs,
        @DefaultValue("2500") long prankSameTargetGapMs,
        @DefaultValue("9000") long prankAnswerWindowMs,
        @DefaultValue("2") int prankIgnoreLimit,
        @DefaultValue("60000") long prankBlockMs) {
}
