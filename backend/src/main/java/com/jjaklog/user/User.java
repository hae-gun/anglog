package com.jjaklog.user;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "users")
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 20)
    private String handle;

    @Column(nullable = false, length = 20)
    private String nickname;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    /** BCrypt hash, or null for accounts made with the development login. */
    @Column(name = "password_hash", length = 100)
    private String passwordHash;

    protected User() {
    }

    public User(String handle, String nickname, Instant createdAt) {
        this.handle = handle;
        this.nickname = nickname;
        this.createdAt = createdAt;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public void setPasswordHash(String passwordHash) {
        this.passwordHash = passwordHash;
    }

    public Long getId() {
        return id;
    }

    public String getHandle() {
        return handle;
    }

    public String getNickname() {
        return nickname;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void rename(String nickname) {
        this.nickname = nickname;
    }
}
