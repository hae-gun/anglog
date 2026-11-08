package com.jjaklog.parrot;

/** Species we have 3D models for. OTHER uses the generic model with the owner's colors. */
public enum Species {
    BUDGIE("사랑앵무"),
    LOVEBIRD("모란앵무"),
    COCKATIEL("왕관앵무"),
    QUAKER("퀘이커"),
    GREEN_CHEEKED_CONURE("그린칙코뉴어"),
    OTHER("기타");

    private final String label;

    Species(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }
}
