package com.anglog.realtime.park;

import static org.assertj.core.api.Assertions.assertThat;

import com.anglog.realtime.protocol.LookRules;
import com.anglog.realtime.protocol.Messages.Look;
import com.anglog.realtime.protocol.Pose;
import org.junit.jupiter.api.Test;

class ChannelTest {

    private static final Look LOOK = new Look("앵무", "OTHER", LookRules.DEFAULT_COLORS, null);

    @Test
    void joinMoveLeaveInOneBatch() {
        Channel c = new Channel(1);
        int a = c.join(LOOK, new Pose(0, 0, 0, 0, 0));
        Channel.Batch first = c.drain();
        assertThat(first.joined()).hasSize(1);
        assertThat(c.drain()).isNull();

        int b = c.join(LOOK, new Pose(1, 0, 1, 0, 0));
        c.move(b, new Pose(2, 0, 2, 0, 1)); // joined this tick: announced once, at the newest spot
        c.move(a, new Pose(3, 0, 3, 0, 1));
        c.move(a, new Pose(4, 0, 4, 0, 1)); // only the latest move of a tick goes out
        Channel.Batch second = c.drain();
        assertThat(second.joined()).singleElement().satisfies(p -> assertThat(p.x()).isEqualTo(2.0));
        assertThat(second.moved()).singleElement().satisfies(r -> assertThat(r[1]).isEqualTo(4.0));

        c.say(a, 1);
        c.leave(a); // a leaving bird's own lines are dropped with it
        Channel.Batch third = c.drain();
        assertThat(third.left()).containsExactly(a);
        assertThat(third.says()).isEmpty();
        assertThat(third.online()).isEqualTo(1);
    }
}
