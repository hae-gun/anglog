package com.jjaklog.post;

import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PostImageRepository extends JpaRepository<PostImage, Long> {

    List<PostImage> findByPostIdInOrderByPostIdAscPositionAsc(Collection<Long> postIds);

    List<PostImage> findByPostIdOrderByPositionAsc(Long postId);
}
