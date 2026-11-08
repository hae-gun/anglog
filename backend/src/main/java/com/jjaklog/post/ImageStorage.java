package com.jjaklog.post;

import com.jjaklog.common.ApiException;
import com.jjaklog.common.JjaklogProperties;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.LocalDate;
import java.util.Iterator;
import java.util.UUID;
import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageOutputStream;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

/**
 * Saves uploaded photos to local disk.
 *
 * Every photo is decoded and re-encoded as a fresh JPEG. That throws away all metadata,
 * including the GPS position phones write into photos, so a diary photo never reveals
 * where someone lives. It also caps the size so storage and traffic stay small.
 */
@Component
public class ImageStorage {

    public record StoredImage(String path, int width, int height) {
    }

    static final int MAX_EDGE = 1600;
    private static final float QUALITY = 0.85f;

    private final Path root;
    private final Clock clock;
    private final JjaklogProperties props;

    public ImageStorage(JjaklogProperties props, Clock clock) {
        this.root = Path.of(props.storage().dir()).toAbsolutePath().normalize();
        this.clock = clock;
        this.props = props;
        ImageIO.setUseCache(false);
    }

    public StoredImage store(MultipartFile file) {
        BufferedImage src;
        try (InputStream in = file.getInputStream()) {
            src = ImageIO.read(in);
        } catch (IOException e) {
            throw ApiException.badRequest("BAD_IMAGE", "사진을 읽지 못했어요.");
        }
        if (src == null) {
            throw ApiException.badRequest("BAD_IMAGE", "JPG나 PNG 사진만 올릴 수 있어요.");
        }

        int w = src.getWidth();
        int h = src.getHeight();
        double scale = Math.min(1.0, (double) MAX_EDGE / Math.max(w, h));
        int tw = Math.max(1, (int) Math.round(w * scale));
        int th = Math.max(1, (int) Math.round(h * scale));

        BufferedImage out = new BufferedImage(tw, th, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = out.createGraphics();
        try {
            g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
            g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
            g.setColor(Color.WHITE);
            g.fillRect(0, 0, tw, th);
            g.drawImage(src, 0, 0, tw, th, null);
        } finally {
            g.dispose();
        }

        LocalDate today = LocalDate.now(clock.withZone(props.zoneId()));
        String rel = String.format("%d/%02d/%s.jpg", today.getYear(), today.getMonthValue(), UUID.randomUUID());
        Path target = root.resolve(rel);
        try {
            Files.createDirectories(target.getParent());
            writeJpeg(out, target);
        } catch (IOException e) {
            throw new UncheckedIOException("Could not save photo " + rel, e);
        }
        return new StoredImage(rel, tw, th);
    }

    public static String url(String path) {
        return "/media/" + path;
    }

    private static void writeJpeg(BufferedImage image, Path target) throws IOException {
        Iterator<ImageWriter> writers = ImageIO.getImageWritersByFormatName("jpg");
        if (!writers.hasNext()) {
            throw new IOException("No JPEG writer available");
        }
        ImageWriter writer = writers.next();
        ImageWriteParam param = writer.getDefaultWriteParam();
        param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
        param.setCompressionQuality(QUALITY);
        try (ImageOutputStream ios = ImageIO.createImageOutputStream(target.toFile())) {
            writer.setOutput(ios);
            writer.write(null, new IIOImage(image, null, null), param);
        } finally {
            writer.dispose();
        }
    }
}
