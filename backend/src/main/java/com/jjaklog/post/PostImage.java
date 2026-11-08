package com.jjaklog.post;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "post_images")
public class PostImage {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "post_id", nullable = false)
    private Long postId;

    /** Path relative to the storage folder, e.g. 2026/11/abc.jpg (served as /media/2026/11/abc.jpg). */
    @Column(nullable = false, length = 200)
    private String path;

    @Column(nullable = false)
    private int width;

    @Column(nullable = false)
    private int height;

    @Column(nullable = false)
    private int position;

    protected PostImage() {
    }

    public PostImage(Long postId, String path, int width, int height, int position) {
        this.postId = postId;
        this.path = path;
        this.width = width;
        this.height = height;
        this.position = position;
    }

    public Long getPostId() {
        return postId;
    }

    public String getPath() {
        return path;
    }

    public int getWidth() {
        return width;
    }

    public int getHeight() {
        return height;
    }

    public int getPosition() {
        return position;
    }
}
