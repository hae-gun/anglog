package com.jjaklog.post;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PostRepository extends JpaRepository<Post, Long> {

    /** Everyone's posts, newest first, older than the cursor. */
    @Query("select p from Post p where p.id < :cursor order by p.id desc")
    List<Post> latest(@Param("cursor") long cursor, Pageable page);

    /** Posts by people I follow, plus my own. */
    @Query("""
            select p from Post p
            where p.id < :cursor
              and (p.authorId = :me
                   or p.authorId in (select f.followeeId from Follow f where f.followerId = :me))
            order by p.id desc
            """)
    List<Post> following(@Param("me") Long me, @Param("cursor") long cursor, Pageable page);

    @Query("select p from Post p where p.authorId = :authorId and p.id < :cursor order by p.id desc")
    List<Post> byAuthor(@Param("authorId") Long authorId, @Param("cursor") long cursor, Pageable page);

    long countByAuthorId(Long authorId);

    @Query("select p.createdAt from Post p where p.authorId = :authorId and p.createdAt >= :since")
    List<Instant> postTimesSince(@Param("authorId") Long authorId, @Param("since") Instant since);

    Optional<Post> findFirstByAuthorIdAndWeightGIsNotNullOrderByIdDesc(Long authorId);

    Optional<Post> findFirstByAuthorIdAndMoodIsNotNullOrderByIdDesc(Long authorId);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update Post p set p.likeCount = p.likeCount + :delta where p.id = :id")
    int addLikes(@Param("id") Long id, @Param("delta") int delta);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update Post p set p.commentCount = p.commentCount + :delta where p.id = :id")
    int addComments(@Param("id") Long id, @Param("delta") int delta);
}
