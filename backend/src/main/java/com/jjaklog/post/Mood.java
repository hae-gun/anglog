package com.jjaklog.post;

/** How the bird seemed today, as the owner records it. Shown in the 3D room as a pose. */
public enum Mood {
    HAPPY("신나요"),
    CALM("평온해요"),
    SLEEPY("졸려요"),
    PLAYFUL("장난꾸러기"),
    GRUMPY("삐졌어요"),
    HUNGRY("배고파요");

    private final String label;

    Mood(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }
}
