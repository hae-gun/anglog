package com.anglog.realtime.park;

import com.anglog.realtime.config.ParkProperties;

/**
 * Limits for pranks between birds (docs/park-realtime.md, 8).
 * range: how close the two birds must be. sameTargetGapMs: one prank on the same bird per this long.
 * answerWindowMs: how long the target may answer. ignoreLimit and blockMs: after this many ignores in a row
 * the prankster may not prank that bird again for blockMs.
 */
public record PrankRules(double range, long sameTargetGapMs, long answerWindowMs, int ignoreLimit, long blockMs) {

    /** Poke, shove, snatch a snack, sit on the head, pretend to preen and poke. */
    public static final int KINDS = 5;
    public static final int ANSWER_BACK = 0;
    public static final int ANSWER_MAKE_UP = 1;
    public static final int ANSWER_IGNORE = 2;
    public static final int ANSWERS = 3;

    public static PrankRules from(ParkProperties p) {
        return new PrankRules(p.prankRange(), p.prankSameTargetGapMs(), p.prankAnswerWindowMs(), p.prankIgnoreLimit(), p.prankBlockMs());
    }
}
