package com.jjaklog.room;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;

/** A visitor's trace in someone's room: one per visitor per room per day. */
@Entity
@Table(name = "feathers")
public class Feather {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "room_owner_id", nullable = false)
    private Long roomOwnerId;

    @Column(name = "visitor_id", nullable = false)
    private Long visitorId;

    @Column(name = "visit_date", nullable = false)
    private LocalDate visitDate;

    /** The visitor's bird's body color, so the feather looks like it came from them. */
    @Column(nullable = false, length = 7)
    private String color;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected Feather() {
    }

    public Feather(Long roomOwnerId, Long visitorId, LocalDate visitDate, String color, Instant createdAt) {
        this.roomOwnerId = roomOwnerId;
        this.visitorId = visitorId;
        this.visitDate = visitDate;
        this.color = color;
        this.createdAt = createdAt;
    }

    public Long getId() {
        return id;
    }

    public Long getRoomOwnerId() {
        return roomOwnerId;
    }

    public Long getVisitorId() {
        return visitorId;
    }

    public LocalDate getVisitDate() {
        return visitDate;
    }

    public String getColor() {
        return color;
    }
}
