package com.jjaklog.common;

import com.jjaklog.user.UserGate;
import java.nio.file.Path;
import java.util.List;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    private final JjaklogProperties props;
    private final UserGate gate;

    public WebConfig(JjaklogProperties props, UserGate gate) {
        this.props = props;
        this.gate = gate;
    }

    @Override
    public void addArgumentResolvers(List<HandlerMethodArgumentResolver> resolvers) {
        resolvers.add(new LoginUserArgumentResolver(gate));
    }

    /**
     * The screen (GitHub Pages, anglog.nobody-asked.dev) and the API (api.anglog.nobody-asked.dev) are
     * different origins of the same site, so the session cookie (SameSite=Lax) still travels;
     * the browser only needs this CORS permission, for exactly those origins.
     */
    @Override
    public void addCorsMappings(CorsRegistry registry) {
        List<String> origins = props.cors() == null || props.cors().allowedOrigins() == null
                ? List.of()
                : props.cors().allowedOrigins().stream().map(String::trim).filter(o -> !o.isEmpty()).toList();
        if (origins.isEmpty()) {
            return;
        }
        registry.addMapping("/api/**")
                .allowedOrigins(origins.toArray(String[]::new))
                .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE")
                .allowedHeaders("Content-Type")
                .allowCredentials(true)
                .maxAge(3600);
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        // Uploaded photos. Later this moves to object storage (e.g. Cloudflare R2) behind a CDN.
        String location = Path.of(props.storage().dir()).toAbsolutePath().normalize().toUri().toString();
        registry.addResourceHandler("/media/**")
                .addResourceLocations(location.endsWith("/") ? location : location + "/")
                .setCachePeriod(60 * 60 * 24 * 30);
    }
}
