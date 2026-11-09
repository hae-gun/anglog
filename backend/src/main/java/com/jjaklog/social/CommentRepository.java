package com.jjaklog.social;

import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CommentRepository extends JpaRepository<Comment, Long> {

    /** Oldest first, so a conversation reads top to bottom. Cursor = last id seen. */
    @Query("select c from Comment c where c.postId = :postId and c.id > :after order by c.id asc")
    List<Comment> page(@Param("postId") Long postId, @Param("after") long after, Pageable page);

    /** Admin: every comment, newest first. */
    @Query("select c from Comment c where c.id < :cursor order by c.id desc")
    List<Comment> recent(@Param("cursor") long cursor, Pageable page);
}
