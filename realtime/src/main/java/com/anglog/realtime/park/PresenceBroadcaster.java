package com.anglog.realtime.park;

import com.anglog.realtime.protocol.Messages.Presence;
import com.anglog.realtime.ws.MessageSender;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Batching: instead of forwarding every move to everyone at once
 * (50 birds x 5 moves/s x 49 receivers = 12,250 messages/s per channel),
 * one message per channel per tick carries everything that changed (250 messages/s).
 */
@Component
public class PresenceBroadcaster {

    private final Channels channels;
    private final MessageSender sender;

    public PresenceBroadcaster(Channels channels, MessageSender sender) {
        this.channels = channels;
        this.sender = sender;
    }

    @Scheduled(fixedRateString = "${angpark.presence-ms:200}")
    public void tick() {
        channels.drainAll((no, b) -> sender.broadcast(no,
                Presence.of(no, b.online(), b.joined(), b.moved(), b.left(), b.looks(), b.emotes(), b.says(),
                        b.pranks(), b.answers(), b.calms(), b.boxes())));
    }
}
