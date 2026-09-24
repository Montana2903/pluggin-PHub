const BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "es-419,es;q=0.9,en-US;q=0.8,en;q=0.7",
    "Cookie": "age_verified=1"
};

function isChannelUrl(url) {
    if (!url) return false;
    return url.includes("/pornstar/") || 
           url.includes("/model/") || 
           url.includes("/channel") || 
           url.includes("/user");
}

function getSearchFilters() {
    return [
        {
            id: "duration",
            type: "DropdownFilter",
            name: "Duración",
            options: [
                { id: "", name: "Cualquiera" },
                { id: "10", name: "Corta (1-10 min)" },
                { id: "20", name: "Media (10-20 min)" },
                { id: "30", name: "Larga (+20 min)" }
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
            url: "https://www.pornhub.com",
            thumbnails: new VideoThumbnails([]),
            author: new PlatformAuthorLink("", "Diagnóstico", "", null),
            duration: 0,
            viewCount: 0,
            isLive: false
        })
    ], false);
}

function extractVideosFromDom(dom, baseUrl) {
    const videos = [];
    const nodes = dom.querySelectorAll("li.pcVideoListItem");
    
    if (!nodes || nodes.length === 0) return videos;

    for (const node of nodes) {
        const mainLink = node.querySelector("a");
        if (!mainLink) continue;
        
        const href = mainLink.getAttribute("href");
        if (!href || !href.includes("viewkey=")) continue;

        const titleNode = node.querySelector(".vidTitleWrapper .title a");
        const title = titleNode ? titleNode.text.trim() : "Sin título";
        
        const imgNode = node.querySelector("img");
        const thumbUrl = imgNode ? (imgNode.getAttribute("data-mediumthumb") || imgNode.getAttribute("src")) : "";
        
        const authorNode = node.querySelector(".usernameWrap a");
        const authorName = authorNode ? authorNode.text.trim() : "Desconocido";
        const authorUrl = authorNode ? `https://www.pornhub.com${authorNode.getAttribute("href")}` : "https://www.pornhub.com/channels/";

        let durationSeconds = 0;
        const durationNode = node.querySelector(".duration");
        if (durationNode) {
            const parts = durationNode.text.trim().split(":");
            if (parts.length === 2) {
                durationSeconds = (parseInt(parts[0]) * 60) + parseInt(parts[1]);
            } else if (parts.length === 3) {
                durationSeconds = (parseInt(parts[0]) * 3600) + (parseInt(parts[1]) * 60) + parseInt(parts[2]);
            }
        }

        videos.push(new PlatformVideo({
            id: href.split("viewkey=")[1],
            name: title,
            url: `https://www.pornhub.com${href}`,
            thumbnails: new VideoThumbnails([new VideoThumbnail(thumbUrl)]),
            author: new PlatformAuthorLink(authorUrl, authorName, authorUrl, null),
            duration: durationSeconds,
            viewCount: 0,
            isLive: false
        }));
    }
    return videos;
}

function search(query, type, order, filters) {
    try {
        let url = `https://www.pornhub.com/video/search?search=${encodeURIComponent(query)}`;
        if (filters) {
            if (filters.duration) url += `&min_duration=${filters.duration}`;
            if (filters.quality === "hd") url += `&hd=1`;
        }

        const response = Http.get(url, BROWSER_HEADERS);
        if (!response.isOk) throw new Error(`HTTP ${response.code}`);

        const dom = DOMParser.parse(response.body);
        const videos = extractVideosFromDom(dom, url);
        
        if (videos.length === 0) throw new Error("Selectores CSS fallaron o la página devolvió 0 resultados.");

        return new VideoListPager(videos, false);
    } catch (error) {
        return createErrorVideo(error.message);
    }
}

function getChannel(url) {
    try {
        const response = Http.get(url, BROWSER_HEADERS);
        if (!response.isOk) throw new Error(`HTTP ${response.code}`);
        
        const dom = DOMParser.parse(response.body);
        
        const nameNode = dom.querySelector("h1[itemprop='name']") || dom.querySelector(".name");
        const avatarNode = dom.querySelector("#getAvatar");
        const bannerNode = dom.querySelector("#coverPictureDefault");
        const descNode = dom.querySelector(".aboutMeText");

        return new PlatformChannel({
            id: url,
            name: nameNode ? nameNode.text.trim() : "Canal",
            thumbnail: avatarNode ? avatarNode.getAttribute("src") : "",
            banner: bannerNode ? bannerNode.getAttribute("src") : "",
            url: url,
            description: descNode ? descNode.text.trim() : ""
        });
    } catch (error) {
        throw new Error("Fallo al cargar perfil: " + error.message);
    }
}

function getChannelContents(url, page) {
    try {
        let pagedUrl = url.includes("?") ? `${url}&page=${page}` : `${url}/videos?page=${page}`;
        const response = Http.get(pagedUrl, BROWSER_HEADERS);
        if (!response.isOk) throw new Error(`HTTP ${response.code}`);

        const dom = DOMParser.parse(response.body);
        const videos = extractVideosFromDom(dom, url);
        
        if (videos.length === 0 && page === 1) throw new Error("Canal vacío o fallaron selectores CSS.");

        return new VideoListPager(videos, videos.length > 0);
    } catch (error) {
        return createErrorVideo(error.message);
    }
}

function getVideoDetails(url) {
    const response = Http.get(url, BROWSER_HEADERS);
    if (!response.isOk) throw new Error(`Error de red al obtener video: HTTP ${response.code}`);
    
    const body = response.body;
    const flashvarsMatch = body.match(/var flashvars_[\d]+ = (\{.*?\});/);
    if (!flashvarsMatch) throw new Error("No se pudo extraer la configuración del reproductor. Posible cambio en la ofuscación de la web.");
    
    const config = JSON.parse(flashvarsMatch[1]);
    const videoSources = [];
    
    if (config.mediaDefinitions) {
        for (const media of config.mediaDefinitions) {
            if (media.videoUrl && media.videoUrl.length > 0) {
                videoSources.push(new VideoSource({
                    url: media.videoUrl,
                    quality: media.quality ? media.quality.toString() + "p" : "Auto",
                    format: media.format || "mp4",
                    width: parseInt(media.quality) || 0,
                    height: parseInt(media.quality) || 0
                }));
            }
        }
    }

    const subtitles = [];
    if (config.closedCaptionsFile) {
        subtitles.push(new SubtitleSource({
            url: config.closedCaptionsFile,
            name: "Subtítulos",
            format: "vtt"
        }));
    }

    return new VideoDetails({
        id: config.video_url || url.split("viewkey=")[1],
        name: config.video_title || "Video",
        url: url,
        videoSources: videoSources,
        subtitles: subtitles,
        author: new PlatformAuthorLink("", "Autor", "", null),
        description: "",
        thumbnails: new VideoThumbnails([new VideoThumbnail(config.image_url)])
    });
}
