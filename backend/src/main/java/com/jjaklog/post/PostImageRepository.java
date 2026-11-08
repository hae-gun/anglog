package com.jjaklog.post;

import java.util.Collection;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PostImageRepository extends JpaRepository<PostImage, Long> {

    List<PostImage> findByPostIdInOrderByPostIdAscPositionAsc(Collection<Long> postIds);

    List<PostImage> findByPostIdOrderByPositionAsc(Long postId);

    /** [authorId, first photo path] of photo diaries by these authors, newest first. The first row per author is the cover. */
    @Query("select p.authorId, i.path from PostImage i, Post p where i.postId = p.id and i.position = 0 and p.authorId in :ids order by p.id desc")
    List<Object[]> coversByAuthors(@Param("ids") Collection<Long> ids, Pageable page);
}
