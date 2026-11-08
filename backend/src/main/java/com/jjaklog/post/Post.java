package com.jjaklog.post;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;

/** One diary entry: photos and text, plus optional weight and mood records. */
@Entity
@Table(name = "posts")
public class Post {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "author_id", nullable = false)
    private Long authorId;

    @Column(name = "parrot_id")
    private Long parrotId;

    @Column(nullable = false, length = 2000)
    private String body;

    @Column(name = "weight_g", precision = 5, scale = 1)
    private BigDecimal weightG;

    @Enumerated(EnumType.STRING)
    @Column(length = 20)
    private Mood mood;

    @Column(name = "like_count", nullable = false)
    private int likeCount;

    @Column(name = "comment_count", nullable = false)
    private int commentCount;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected Post() {
    }

    public Post(Long authorId, Long parrotId, String body, BigDecimal weightG, Mood mood, Instant createdAt) {
        this.authorId = authorId;
        this.parrotId = parrotId;
        this.body = body;
        this.weightG = weightG;
        this.mood = mood;
        this.createdAt = createdAt;
    }

    public Long getId() {
        return id;
    }

    public Long getAuthorId() {
        return authorId;
    }

    public Long getParrotId() {
        return parrotId;
    }

    public String getBody() {
        return body;
    }

    public BigDecimal getWeightG() {
        return weightG;
    }

    public Mood getMood() {
        return mood;
    }

    public int getLikeCount() {
        return likeCount;
    }

    public int getCommentCount() {
        return commentCount;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
