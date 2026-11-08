package com.jjaklog.post;

import com.jjaklog.parrot.Parrot;
import com.jjaklog.parrot.ParrotService;
import com.jjaklog.parrot.ParrotView;
import com.jjaklog.social.PostLikeRepository;
import com.jjaklog.user.User;
import com.jjaklog.user.UserService;
import com.jjaklog.user.UserSummary;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Turns post rows into views. Looks up authors, parrots, photos and "did I like this"
 * with one query each for the whole page instead of one per post.
 */
@Component
public class PostAssembler {

    private final UserService users;
    private final ParrotService parrots;
    private final PostImageRepository images;
    private final PostLikeRepository likes;

    public PostAssembler(UserService users, ParrotService parrots, PostImageRepository images, PostLikeRepository likes) {
        this.users = users;
        this.parrots = parrots;
        this.images = images;
        this.likes = likes;
    }

    @Transactional(readOnly = true)
    public List<PostView> toViews(List<Post> posts, Long viewerId) {
        if (posts.isEmpty()) {
            return List.of();
        }
        List<Long> postIds = posts.stream().map(Post::getId).toList();
        Map<Long, User> authors = users.byIds(posts.stream().map(Post::getAuthorId).collect(Collectors.toSet()));
        Map<Long, Parrot> birds = parrots.byIds(posts.stream().map(Post::getParrotId).filter(Objects::nonNull).collect(Collectors.toSet()));
        Map<Long, List<PostImage>> photos = images.findByPostIdInOrderByPostIdAscPositionAsc(postIds).stream()
                .collect(Collectors.groupingBy(PostImage::getPostId));
        Set<Long> liked = viewerId == null ? Set.of() : new HashSet<>(likes.findLikedPostIds(viewerId, postIds));

        List<PostView> views = new ArrayList<>(posts.size());
        for (Post p : posts) {
            User author = authors.get(p.getAuthorId());
            Parrot parrot = p.getParrotId() == null ? null : birds.get(p.getParrotId());
            List<PostView.ImageView> imgs = photos.getOrDefault(p.getId(), List.of()).stream()
                    .map(i -> new PostView.ImageView(ImageStorage.url(i.getPath()), i.getWidth(), i.getHeight()))
                    .toList();
            views.add(new PostView(
                    p.getId(),
                    author == null ? null : UserSummary.of(author),
                    parrot == null ? null : ParrotView.of(parrot),
                    p.getBody(),
                    p.getWeightG(),
                    p.getMood(),
                    p.getMood() == null ? null : p.getMood().label(),
                    imgs,
                    p.getLikeCount(),
                    p.getCommentCount(),
                    liked.contains(p.getId()),
                    p.getCreatedAt()));
        }
        return views;
    }
}
