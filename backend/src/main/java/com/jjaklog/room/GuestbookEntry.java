package com.jjaklog.room;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "guestbook_entries")
public class GuestbookEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "room_owner_id", nullable = false)
    private Long roomOwnerId;

    @Column(name = "author_id", nullable = false)
    private Long authorId;

    @Column(nullable = false, length = 300)
    private String body;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected GuestbookEntry() {
    }

    public GuestbookEntry(Long roomOwnerId, Long authorId, String body, Instant createdAt) {
        this.roomOwnerId = roomOwnerId;
        this.authorId = authorId;
        this.body = body;
        this.createdAt = createdAt;
    }

    public Long getId() {
        return id;
    }

    public Long getRoomOwnerId() {
        return roomOwnerId;
    }

    public Long getAuthorId() {
        return authorId;
    }

    public String getBody() {
        return body;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
