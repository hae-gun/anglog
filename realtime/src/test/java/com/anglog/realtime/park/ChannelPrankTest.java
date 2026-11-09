package com.anglog.realtime.park;

import static org.assertj.core.api.Assertions.assertThat;

import com.anglog.realtime.park.Channel.PrankResult;
import com.anglog.realtime.protocol.LookRules;
import com.anglog.realtime.protocol.Messages.Look;
import com.anglog.realtime.protocol.Pose;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class ChannelPrankTest {

    private static final Look LOOK = new Look("앵무", "OTHER", LookRules.DEFAULT_COLORS, null);
    private static final PrankRules RULES = new PrankRules(3.2, 2500, 9000, 2, 60_000);

    Channel c;
    int a;
    int b;

    @BeforeEach
    void twoBirdsSideBySide() {
        c = new Channel(1);
        a = c.join(LOOK, new Pose(0, 0, 0, 0, 0));
        b = c.join(LOOK, new Pose(1, 0, 0, 0, 0));
        c.drain();
    }

    @Test
    void aPrankIsBroadcastAndCanBeAnsweredOnce() {
        assertThat(c.prank(a, b, 0, 1_000, RULES)).isEqualTo(PrankResult.OK);
        assertThat(c.drain().pranks()).singleElement().satisfies(p -> assertThat(p).containsExactly(a, b, 0));

        assertThat(c.answer(b, a, PrankRules.ANSWER_MAKE_UP, 2_000, RULES)).isTrue();
        assertThat(c.answer(b, a, PrankRules.ANSWER_MAKE_UP, 2_100, RULES)).isFalse(); // already answered
        assertThat(c.drain().answers()).singleElement().satisfies(x -> assertThat(x).containsExactly(b, a, 1));
    }

    @Test
    void answeringBackLetsTheOtherAnswerInTurn() {
        c.prank(a, b, 1, 1_000, RULES);
        assertThat(c.answer(b, a, PrankRules.ANSWER_BACK, 1_500, RULES)).isTrue();
        // now it is a's turn: back and forth, 투닥투닥
        assertThat(c.answer(a, b, PrankRules.ANSWER_BACK, 2_000, RULES)).isTrue();
        assertThat(c.answer(b, a, PrankRules.ANSWER_MAKE_UP, 2_500, RULES)).isTrue();
        assertThat(c.drain().answers()).hasSize(3);
    }

    @Test
    void noAnswerWithoutAPrankOrAfterTheWindow() {
        assertThat(c.answer(b, a, PrankRules.ANSWER_BACK, 1_000, RULES)).isFalse();
        c.prank(a, b, 0, 1_000, RULES);
        assertThat(c.answer(b, a, PrankRules.ANSWER_BACK, 1_000 + 9_001, RULES)).isFalse();
    }

    @Test
    void theServerChecksWhatBrowsersCannotBeTrustedWith() {
        assertThat(c.prank(a, a, 0, 1_000, RULES)).isEqualTo(PrankResult.GONE);
        assertThat(c.prank(a, 99, 0, 1_000, RULES)).isEqualTo(PrankResult.GONE);

        c.move(b, new Pose(10, 0, 0, 0, 0));
        assertThat(c.prank(a, b, 0, 1_000, RULES)).isEqualTo(PrankResult.FAR);
        c.move(b, new Pose(1, 0, 0, 0, 0));

        assertThat(c.prank(a, b, 0, 1_000, RULES)).isEqualTo(PrankResult.OK);
        assertThat(c.prank(a, b, 0, 2_000, RULES)).isEqualTo(PrankResult.WAIT); // same bird too soon
        assertThat(c.prank(a, b, 0, 3_600, RULES)).isEqualTo(PrankResult.OK);

        c.calm(b, true);
        assertThat(c.isCalm(b)).isTrue();
        assertThat(c.prank(a, b, 0, 10_000, RULES)).isEqualTo(PrankResult.CALM);
        assertThat(c.drain().calms()).singleElement().satisfies(x -> assertThat(x).containsExactly(b, 1));
    }

    @Test
    void ignoredTwiceInARowMeansNoPranksForAMinute() {
        c.prank(a, b, 0, 1_000, RULES);
        c.answer(b, a, PrankRules.ANSWER_IGNORE, 1_500, RULES);
        c.prank(a, b, 0, 5_000, RULES);
        c.answer(b, a, PrankRules.ANSWER_IGNORE, 5_500, RULES);
        assertThat(c.prank(a, b, 0, 9_000, RULES)).isEqualTo(PrankResult.BLOCKED);
        assertThat(c.prank(a, b, 0, 5_500 + 60_001, RULES)).isEqualTo(PrankResult.OK);
    }

    @Test
    void makingUpResetsTheIgnoreCount() {
        c.prank(a, b, 0, 1_000, RULES);
        c.answer(b, a, PrankRules.ANSWER_IGNORE, 1_500, RULES);
        c.prank(a, b, 0, 5_000, RULES);
        c.answer(b, a, PrankRules.ANSWER_MAKE_UP, 5_500, RULES);
        c.prank(a, b, 0, 9_000, RULES);
        c.answer(b, a, PrankRules.ANSWER_IGNORE, 9_500, RULES);
        assertThat(c.prank(a, b, 0, 13_000, RULES)).isEqualTo(PrankResult.OK);
    }

    @Test
    void leavingClearsEverything() {
        c.prank(a, b, 0, 1_000, RULES);
        c.leave(a);
        assertThat(c.answer(b, a, PrankRules.ANSWER_BACK, 1_500, RULES)).isFalse();
        assertThat(c.drain().pranks()).isEmpty();
    }
}
