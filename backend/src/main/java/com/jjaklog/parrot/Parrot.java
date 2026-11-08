package com.jjaklog.parrot;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "parrots")
public class Parrot {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "owner_id", nullable = false)
    private Long ownerId;

    @Column(nullable = false, length = 20)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private Species species;

    @Column(name = "birth_date")
    private LocalDate birthDate;

    @Column(name = "adopted_date")
    private LocalDate adoptedDate;

    @Column(name = "color_face", nullable = false, length = 7)
    private String colorFace;

    @Column(name = "color_head", nullable = false, length = 7)
    private String colorHead;

    @Column(name = "color_body", nullable = false, length = 7)
    private String colorBody;

    @Column(name = "color_wing", nullable = false, length = 7)
    private String colorWing;

    @Column(name = "color_tail", nullable = false, length = 7)
    private String colorTail;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected Parrot() {
    }

    public Parrot(Long ownerId, Instant createdAt) {
        this.ownerId = ownerId;
        this.createdAt = createdAt;
    }

    public void update(String name, Species species, LocalDate birthDate, LocalDate adoptedDate, ParrotColors colors) {
        this.name = name;
        this.species = species;
        this.birthDate = birthDate;
        this.adoptedDate = adoptedDate;
        this.colorFace = colors.face();
        this.colorHead = colors.head();
        this.colorBody = colors.body();
        this.colorWing = colors.wing();
        this.colorTail = colors.tail();
    }

    public Long getId() {
        return id;
    }

    public Long getOwnerId() {
        return ownerId;
    }

    public String getName() {
        return name;
    }

    public Species getSpecies() {
        return species;
    }

    public LocalDate getBirthDate() {
        return birthDate;
    }

    public LocalDate getAdoptedDate() {
        return adoptedDate;
    }

    public ParrotColors colors() {
        return new ParrotColors(colorFace, colorHead, colorBody, colorWing, colorTail);
    }
}
