function getHeaders() {
    return {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "es-419,es;q=0.9,en;q=0.8"
    };
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

function search(query, type, order, filters) {
    try {
        let url = `https://www.pornhub.com/video/search?search=${encodeURIComponent(query)}`;
        if (filters) {
            if (filters.duration) url += `&min_duration=${filters.duration}`;
            if (filters.quality === "hd") url += `&hd=1`;
        }

        const response = Http.get(url, getHeaders());
        if (!response.isOk) throw new Error(`Conexión rechazada. Código HTTP: ${response.code}`);

        const dom = DOMParser.parse(response.body);
        const videos = [];
        
        const nodes = dom.querySelectorAll(".pcVideoListItem");
        if (!nodes || nodes.length === 0) throw new Error("DOM modificado. No se encontraron nodos de video.");

        for (const node of nodes) {
            const a = node.querySelector("a");
            if (!a) continue;
            
            const href = a.getAttribute("href");
            if (!href || !href.includes("viewkey=")) continue;

            const titleNode = node.querySelector(".title");
            const imgNode = node.querySelector("img");
            let thumbUrl = "";
            
            if (imgNode) {
                thumbUrl = imgNode.getAttribute("data-thumb_url") || imgNode.getAttribute("data-mediabook") || imgNode.getAttribute("src") || "";
            }

            const authorNode = node.querySelector(".usernameWrap a");

            videos.push(new PlatformVideo({
                id: href.split("viewkey=")[1],
                name: titleNode ? titleNode.text : "Sin título",
                url: `https://www.pornhub.com${href}`,
                thumbnails: new VideoThumbnails([new VideoThumbnail(thumbUrl)]),
                author: new PlatformAuthorLink(
                    authorNode ? `https://www.pornhub.com${authorNode.getAttribute("href")}` : "", 
                    authorNode ? authorNode.text : "Desconocido", 
                    "", 
                    null
                ),
                duration: 0, 
                viewCount: 0,
                isLive: false
            }));
        }
        return new VideoListPager(videos, false);
    } catch (e) {
        return _renderError("Error de búsqueda: " + e.message);
    }
}

function getVideoDetails(url) {
    const response = Http.get(url, getHeaders());
    const body = response.body;
    
    const flashvarsMatch = body.match(/var flashvars_[\d]+ = (\{.*?\});/);
    if (!flashvarsMatch) throw new Error("Variables de reproducción no encontradas.");
    
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

function getChannel(url) {
    const response = Http.get(url, getHeaders());
    const dom = DOMParser.parse(response.body);
    
    const nameNode = dom.querySelector("h1[itemprop='name']");
    const avatarNode = dom.querySelector("#getAvatar");
    
    return new PlatformChannel({
        id: url,
        name: nameNode ? nameNode.text : "Canal",
        thumbnail: avatarNode ? avatarNode.getAttribute("src") : "",
        banner: "",
        url: url,
        description: ""
    });
}

function getChannelContents(url, page) {
    try {
        let pagedUrl = url.includes("?") ? `${url}&page=${page}` : `${url}/videos?page=${page}`;
        const response = Http.get(pagedUrl, getHeaders());
        if (!response.isOk) throw new Error("Conexión rechazada en el canal.");

        const dom = DOMParser.parse(response.body);
        const videos = [];
        
        const nodes = dom.querySelectorAll(".pcVideoListItem");
        if (!nodes || nodes.length === 0) return new VideoListPager([], false);

        for (const node of nodes) {
            const a = node.querySelector("a");
            if (!a) continue;
            
            const href = a.getAttribute("href");
            if (!href || !href.includes("viewkey=")) continue;

            const titleNode = node.querySelector(".title");
            const imgNode = node.querySelector("img");
            
            videos.push(new PlatformVideo({
                id: href.split("viewkey=")[1],
                name: titleNode ? titleNode.text : "Video de canal",
                url: `https://www.pornhub.com${href}`,
                thumbnails: new VideoThumbnails([new VideoThumbnail(imgNode ? imgNode.getAttribute("src") : "")]),
                author: new PlatformAuthorLink(url, "Canal", url, null),
                duration: 0,
                viewCount: 0,
                isLive: false
            }));
        }
        
        return new VideoListPager(videos, nodes.length > 0);
    } catch (e) {
        return _renderError("Error en canal: " + e.message);
    }
}

function _renderError(msg) {
    return new VideoListPager([
        new PlatformVideo({
            id: "error_debug",
            name: msg,
            url: "https://localhost",
            thumbnails: new VideoThumbnails([]),
            author: new PlatformAuthorLink("", "Sistema", "", null),
            duration: 0,
            viewCount: 0,
            isLive: false
        })
    ], false);
}
