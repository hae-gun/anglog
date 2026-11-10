package com.anglog.realtime.park;

import static org.assertj.core.api.Assertions.assertThat;

import com.anglog.realtime.protocol.LookRules;
import com.anglog.realtime.protocol.Messages.Look;
import com.anglog.realtime.protocol.Pose;
import org.junit.jupiter.api.Test;

/** 빼빼로 숲 boxes: first come gets it, back after ten seconds, everyone hears both. */
class ChannelBoxTest {

    private static final Look LOOK = new Look("앵무", "OTHER", LookRules.DEFAULT_COLORS, null);

    @Test
    void onlyTheFirstBirdGetsABoxAndItComesBack() {
        Channel c = new Channel(1);
        int a = c.join(LOOK, new Pose(0, 0, 80, 0, 0));
        int b = c.join(LOOK, new Pose(1, 0, 80, 0, 0));
        c.drain(0);

        assertThat(c.openBox(a, 3, 1_000)).isTrue();
        assertThat(c.openBox(b, 3, 1_050)).isFalse();
        assertThat(c.boxesAway()).containsExactly(3);
        assertThat(c.drain(1_100).boxes()).singleElement().satisfies(x -> assertThat(x).containsExactly(3, a));

        // not back yet, then back for everyone
        assertThat(c.drain(1_000 + Channel.BOX_BACK_MS - 1)).isNull();
        assertThat(c.drain(1_000 + Channel.BOX_BACK_MS).boxes()).singleElement().satisfies(x -> assertThat(x).containsExactly(3, 0));
        assertThat(c.boxesAway()).isEmpty();
        assertThat(c.openBox(b, 3, 12_000)).isTrue();
    }

    @Test
    void noSuchBoxOrNoSuchBird() {
        Channel c = new Channel(1);
        int a = c.join(LOOK, new Pose(0, 0, 80, 0, 0));
        assertThat(c.openBox(a, -1, 0)).isFalse();
        assertThat(c.openBox(a, Channel.BOXES, 0)).isFalse();
        assertThat(c.openBox(999, 0, 0)).isFalse();
    }
}
