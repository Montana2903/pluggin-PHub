const PORNHUB_BASE_URL = "https://www.pornhub.com";

const BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "es-419,es;q=0.9,en-US;q=0.8,en;q=0.7",
    "Referer": PORNHUB_BASE_URL + "/",
    "Cookie": "age_verified=1; accessAgeDisclaimerPH=1"
};

function getText(node, fallback) {
    if (!node) return fallback || "";

    if (typeof node.textContent === "string") {
        return node.textContent.trim();
    }

    if (typeof node.text === "string") {
        return node.text.trim();
    }

    return fallback || "";
}

function getAttribute(node, name, fallback) {
    if (!node) return fallback || "";

    const value = node.getAttribute(name);
    return value || fallback || "";
}

function normalizeUrl(href, baseUrl) {
    if (!href) return "";

    const value = href.trim();

    if (value.startsWith("http://") || value.startsWith("https://")) {
        return value;
    }

    if (value.startsWith("//")) {
        return "https:" + value;
    }

    if (value.startsWith("/")) {
        return PORNHUB_BASE_URL + value;
    }

    if (baseUrl) {
        const slashIndex = baseUrl.lastIndexOf("/");
        return baseUrl.substring(0, slashIndex + 1) + value;
    }

    return PORNHUB_BASE_URL + "/" + value;
}

function getViewKey(url) {
    if (!url) return "";

    const match = url.match(/[?&]viewkey=([^&#]+)/i);
    return match ? match[1] : "";
}

function isChannelUrl(url) {
    if (!url) return false;

    return /\/(pornstar|model|channels?)\//i.test(url) ||
           /\/user\/[^/]+/i.test(url);
}

function isContentDetailsUrl(url) {
    return !!getViewKey(url);
}

function getSearchFilters() {
    return [
        {
            id: "duration",
            type: "DropdownFilter",
            name: "Duración",
            options: [
                { id: "", name: "Cualquiera" },
                { id: "10", name: "Hasta 10 minutos" },
                { id: "20", name: "Hasta 20 minutos" },
                { id: "30", name: "Más de 20 minutos" }
            ],
            defaultOption: ""
        },
        {
            id: "quality",
            type: "DropdownFilter",
            name: "Calidad",
            options: [
                { id: "", name: "Todas" },
                { id: "hd", name: "HD" }
            ],
            defaultOption: ""
        }
    ];
}

function createErrorVideo(message) {
    return new VideoListPager([
        new PlatformVideo({
            id: "error_log",
            name: "ERROR: " + message,
            url: PORNHUB_BASE_URL,
            thumbnails: new VideoThumbnails([]),
            author: new PlatformAuthorLink(
                PORNHUB_BASE_URL,
                "Diagnóstico",
                PORNHUB_BASE_URL,
                null
            ),
            duration: 0,
            viewCount: 0,
            isLive: false
        })
    ], false);
}

function parseDuration(text) {
    if (!text) return 0;

    const cleanText = text.trim();
    const parts = cleanText.split(":");

    const numbers = [];
    for (const part of parts) {
        const parsed = parseInt(part, 10);
        numbers.push(isNaN(parsed) ? 0 : parsed);
    }

    if (numbers.length === 2) {
        return numbers[0] * 60 + numbers[1];
    }

    if (numbers.length === 3) {
        return numbers[0] * 3600 + numbers[1] * 60 + numbers[2];
    }

    return 0;
}

function extractVideosFromDom(dom) {
    const videos = [];
    const knownIds = {};

    const nodes = dom.querySelectorAll(
        "li.pcVideoListItem, " +
        ".videoBox, " +
        ".video-item, " +
        ".videoPreview, " +
        "[data-video-vkey]"
    );

    if (!nodes || nodes.length === 0) {
        return videos;
    }

    for (const node of nodes) {
        const mainLink = node.querySelector(
            "a[href*='viewkey='], " +
            "a[href*='viewkey'], " +
            "a[data-video-vkey]"
        );

        if (!mainLink) continue;

        let href = getAttribute(mainLink, "href", "");

        if (!href) {
            const dataViewKey = getAttribute(mainLink, "data-video-vkey", "");
            if (dataViewKey) {
                href = "/view_video.php?viewkey=" + dataViewKey;
            }
        }

        if (!href) continue;

        const videoUrl = normalizeUrl(href);
        const viewKey = getViewKey(videoUrl);

        if (!viewKey || knownIds[viewKey]) continue;

        knownIds[viewKey] = true;

        const titleNode = node.querySelector(
            ".vidTitleWrapper .title a, " +
            ".videoTitle a, " +
            ".title a, " +
            "[data-title], " +
            "a[href*='viewkey=']"
        );

        const title =
            getAttribute(titleNode, "data-title", "") ||
            getText(titleNode, "Sin título");

        const imageNode = node.querySelector(
            "img[data-mediumthumb], " +
            "img[data-thumb], " +
            "img[data-src], " +
            "img[src]"
        );

        const thumbnailUrl = normalizeUrl(
            getAttribute(imageNode, "data-mediumthumb", "") ||
            getAttribute(imageNode, "data-thumb", "") ||
            getAttribute(imageNode, "data-src", "") ||
            getAttribute(imageNode, "src", "")
        );

        const authorNode = node.querySelector(
            ".usernameWrap a, " +
            ".videoUploader a, " +
            "a[href*='/model/'], " +
            "a[href*='/pornstar/'], " +
            "a[href*='/channel/'], " +
            "a[href*='/user/']"
        );

        const authorName = getText(authorNode, "Desconocido");
        const authorUrl = authorNode
            ? normalizeUrl(getAttribute(authorNode, "href", ""))
            : PORNHUB_BASE_URL + "/channels/";

        const durationNode = node.querySelector(
            ".duration, .videoDuration, .durationText"
        );

        const duration = parseDuration(getText(durationNode, ""));

        videos.push(new PlatformVideo({
            id: viewKey,
            name: title,
            url: videoUrl,
            thumbnails: new VideoThumbnails([
                new VideoThumbnail(thumbnailUrl)
            ]),
            author: new PlatformAuthorLink(
                authorUrl,
                authorName,
                authorUrl,
                null
            ),
            duration: duration,
            viewCount: 0,
            isLive: false
        }));
    }

    return videos;
}

function search(query, type, order, filters) {
    try {
        let url =
            PORNHUB_BASE_URL +
            "/video/search?search=" +
            encodeURIComponent(query || "");

        if (filters) {
            if (filters.duration) {
                url += "&min_duration=" + encodeURIComponent(filters.duration);
            }

            if (filters.quality === "hd") {
                url += "&hd=1";
            }
        }

        const response = Http.get(url, BROWSER_HEADERS);

        if (!response || !response.isOk) {
            throw new Error("HTTP " + (response ? response.code : "desconocido"));
        }

        const dom = DOMParser.parse(response.body);
        const videos = extractVideosFromDom(dom);

        if (videos.length === 0) {
            return createErrorVideo(
                "No se encontraron resultados o cambiaron los selectores de la página."
            );
        }

        return new VideoListPager(videos, false);
    } catch (error) {
        return createErrorVideo(error.message || String(error));
    }
}

function getChannel(url) {
    try {
        const response = Http.get(url, BROWSER_HEADERS);

        if (!response || !response.isOk) {
            throw new Error("HTTP " + (response ? response.code : "desconocido"));
        }

        const dom = DOMParser.parse(response.body);

        const nameNode = dom.querySelector(
            "h1[itemprop='name'], " +
            "h1.name, " +
            ".channelName, " +
            ".profile-name, " +
            "h1"
        );

        const avatarNode = dom.querySelector(
            "#getAvatar img, " +
            "#getAvatar, " +
            ".avatar img, " +
            ".profileAvatar img, " +
            "img.avatar"
        );

        const bannerNode = dom.querySelector(
            "#coverPictureDefault img, " +
            "#coverPictureDefault, " +
            ".cover img, " +
            ".banner img"
        );

        const descriptionNode = dom.querySelector(
            ".aboutMeText, " +
            ".profile-description, " +
            ".description, " +
            ".bio"
        );

        const avatarUrl = normalizeUrl(
            getAttribute(avatarNode, "src", "") ||
            getAttribute(avatarNode, "data-src", "")
        );

        const bannerUrl = normalizeUrl(
            getAttribute(bannerNode, "src", "") ||
            getAttribute(bannerNode, "data-src", "")
        );

        return new PlatformChannel({
            id: url,
            name: getText(nameNode, "Canal"),
            thumbnail: avatarUrl,
            banner: bannerUrl,
            url: url,
            description: getText(descriptionNode, "")
        });
    } catch (error) {
        throw new Error(
            "Fallo al cargar perfil: " +
            (error.message || String(error))
        );
    }
}

function getChannelContents(url, page) {
    try {
        const currentPage = page || 1;
        let pagedUrl;

        if (url.includes("?")) {
            pagedUrl = url + "&page=" + currentPage;
        } else {
            pagedUrl = url.replace(/\/$/, "") +
                "/videos?page=" + currentPage;
        }

        const response = Http.get(pagedUrl, BROWSER_HEADERS);

        if (!response || !response.isOk) {
            throw new Error("HTTP " + (response ? response.code : "desconocido"));
        }

        const dom = DOMParser.parse(response.body);
        const videos = extractVideosFromDom(dom);

        if (videos.length === 0 && currentPage === 1) {
            return createErrorVideo(
                "El canal no tiene videos o cambiaron los selectores."
            );
        }

        return new VideoListPager(videos, videos.length > 0);
    } catch (error) {
        return createErrorVideo(error.message || String(error));
    }
}

function extractJsonObject(text, startIndex) {
    if (!text || startIndex < 0) return null;

    let openingIndex = text.indexOf("{", startIndex);

    if (openingIndex < 0) return null;

    let depth = 0;
    let insideString = false;
    let escaped = false;

    for (let i = openingIndex; i < text.length; i++) {
        const character = text[i];

        if (insideString) {
            if (escaped) {
                escaped = false;
            } else if (character === "\\") {
                escaped = true;
            } else if (character === "\"") {
                insideString = false;
            }

            continue;
        }

        if (character === "\"") {
            insideString = true;
            continue;
        }

        if (character === "{") {
            depth++;
        } else if (character === "}") {
            depth--;

            if (depth === 0) {
                return text.substring(openingIndex, i + 1);
            }
        }
    }

    return null;
}

function parsePlayerConfig(body) {
    const patterns = [
        /var\s+flashvars_\d+\s*=\s*/i,
        /var\s+flashvars\s*=\s*/i,
        /flashvars_\d+\s*=\s*/i,
        /"mediaDefinitions"\s*:/i
    ];

    for (const pattern of patterns) {
        const match = body.match(pattern);

        if (!match) continue;

        const jsonText = extractJsonObject(body, match.index);

        if (!jsonText) continue;

        try {
            return JSON.parse(jsonText);
        } catch (error) {
            // Se prueba el siguiente formato.
        }
    }

    const config = {};

    const videoUrlMatch = body.match(
        /["']video_url["']\s*:\s*["']([^"']+)["']/i
    );

    const videoTitleMatch = body.match(
        /["']video_title["']\s*:\s*["']([^"']*)["']/i
    );

    const imageUrlMatch = body.match(
        /["']image_url["']\s*:\s*["']([^"']*)["']/i
    );

    const captionsMatch = body.match(
        /["']closedCaptionsFile["']\s*:\s*["']([^"']+)["']/i
    );

    if (videoUrlMatch) config.video_url = videoUrlMatch[1];
    if (videoTitleMatch) config.video_title = videoTitleMatch[1];
    if (imageUrlMatch) config.image_url = imageUrlMatch[1];
    if (captionsMatch) config.closedCaptionsFile = captionsMatch[1];

    const mediaDefinitionsMatch = body.match(
        /["']mediaDefinitions["']\s*:\s*(\[[\s\S]*?\])\s*[,}]/i
    );

    if (mediaDefinitionsMatch) {
        try {
            config.mediaDefinitions = JSON.parse(
                mediaDefinitionsMatch[1]
            );
        } catch (error) {
            // No se pudieron leer las fuentes.
        }
    }

    return config;
}

function getVideoDetails(url) {
    const response = Http.get(url, BROWSER_HEADERS);

    if (!response || !response.isOk) {
        throw new Error(
            "Error de red al obtener video: HTTP " +
            (response ? response.code : "desconocido")
        );
    }

    const config = parsePlayerConfig(response.body);

    if (!config) {
        throw new Error(
            "No se pudo encontrar la configuración del reproductor."
        );
    }

    const videoSources = [];
    const mediaDefinitions = config.mediaDefinitions || [];

    for (const media of mediaDefinitions) {
        if (!media) continue;

        const sourceUrl =
            media.videoUrl ||
            media.video_url ||
            media.url ||
            "";

        if (!sourceUrl) continue;

        const qualityValue = parseInt(
            media.quality || media.height || 0,
            10
        );

        videoSources.push(new VideoSource({
            url: sourceUrl,
            quality: qualityValue > 0
                ? qualityValue + "p"
                : "Auto",
            format: media.format || "mp4",
            width: parseInt(media.width || 0, 10) || 0,
            height: qualityValue || 0
        }));
    }

    if (videoSources.length === 0 && config.videoUrl) {
        videoSources.push(new VideoSource({
            url: config.videoUrl,
            quality: "Auto",
            format: "mp4",
            width: 0,
            height: 0
        }));
    }

    if (videoSources.length === 0) {
        throw new Error(
            "No se pudieron extraer fuentes de video. " +
            "El reproductor puede haber cambiado."
        );
    }

    const subtitles = [];
    const captionsUrl =
        config.closedCaptionsFile ||
        config.closed_captions ||
        config.subtitleUrl ||
        "";

    if (captionsUrl) {
        subtitles.push(new SubtitleSource({
            url: captionsUrl,
            name: "Subtítulos",
            format: "vtt"
        }));
    }

    const videoId =
        config.video_id ||
        config.video_url ||
        getViewKey(url) ||
        url;

    const thumbnailUrl =
        config.image_url ||
        config.imageUrl ||
        "";

    return new VideoDetails({
        id: videoId,
        name: config.video_title || config.title || "Video",
        url: url,
        videoSources: videoSources,
        subtitles: subtitles,
        author: new PlatformAuthorLink(
            "",
            "Autor",
            "",
            null
        ),
        description: config.description || "",
        thumbnails: new VideoThumbnails([
            new VideoThumbnail(thumbnailUrl)
        ])
    });
}

function getHome() {
    return new VideoListPager([], false);
}
