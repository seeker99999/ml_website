(function () {
  const config = {
    githubOwner: "seeker99999",
    githubRepo: "ml_website",
    branch: "main",
    labPicsFolder: "lab_pics",
    ...(window.MORRISON_LAB_SITE_CONFIG || {})
  };

  function getFolder() {
    return (config.labPicsFolder || "lab_pics").replace(/^\/+|\/+$/g, "");
  }

  function isImageFile(name) {
    return /\.(jpe?g|png|webp|gif)$/i.test(name);
  }

  function humanizeFilename(filename) {
    return filename
      .replace(/\.[^.]+$/, "")
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function statusMessage(type, message) {
    const status = document.getElementById("gallery-status");
    if (!status) return;

    if (!message) {
      status.hidden = true;
      status.className = "gallery-status";
      status.innerHTML = "";
      return;
    }

    status.hidden = false;
    status.className = `gallery-status ${type || ""}`.trim();
    status.innerHTML = message;
  }

  function encodePath(path) {
    return path.split("/").map(encodeURIComponent).join("/");
  }

  function imageFromFilename(filename, cacheKey) {
    const folder = getFolder();
    const cleanName = filename.replace(/^\/+/, "").split("/").pop();

    return {
      name: cleanName,
      title: humanizeFilename(cleanName),
      src: `${encodePath(folder)}/${encodeURIComponent(cleanName)}?v=${encodeURIComponent(cacheKey)}`
    };
  }

  function uniqueImages(images) {
    const seen = new Set();

    return images
      .filter((image) => image && image.name && isImageFile(image.name))
      .filter((image) => {
        const key = image.name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }

  async function fetchJson(url) {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json" }
    });

    if (!response.ok) {
      throw new Error(`${response.status}`);
    }

    return response.json();
  }

  async function fetchFromLocalManifest(cacheKey) {
    const folder = getFolder();
    const manifestUrl = `${encodePath(folder)}/gallery.json?v=${encodeURIComponent(cacheKey)}`;
    const data = await fetchJson(manifestUrl);

    if (!Array.isArray(data)) return [];

    return uniqueImages(
      data
        .filter((name) => typeof name === "string")
        .filter(isImageFile)
        .map((name) => imageFromFilename(name, cacheKey))
    );
  }

  async function fetchFromGitHubApi(cacheKey) {
    const folder = getFolder();
    const url = `https://api.github.com/repos/${config.githubOwner}/${config.githubRepo}/contents/${encodeURIComponent(folder)}?ref=${encodeURIComponent(config.branch)}&_=${encodeURIComponent(cacheKey)}`;

    const data = await fetchJson(url);
    if (!Array.isArray(data)) return [];

    return uniqueImages(
      data
        .filter((file) => file.type === "file" && isImageFile(file.name))
        .map((file) => imageFromFilename(file.name, cacheKey))
    );
  }

  async function fetchFromHardFallback(cacheKey) {
    return uniqueImages([
      imageFromFilename("test1.jpg", cacheKey),
      imageFromFilename("test_png.png", cacheKey)
    ]);
  }

  async function fetchGalleryImages() {
    const cacheKey = Date.now().toString();

    try {
      const manifestImages = await fetchFromLocalManifest(cacheKey);
      if (manifestImages.length) return manifestImages;
    } catch (error) {
      // Continue to fallback.
    }

    try {
      const apiImages = await fetchFromGitHubApi(cacheKey);
      if (apiImages.length) return apiImages;
    } catch (error) {
      // Continue to fallback.
    }

    return fetchFromHardFallback(cacheKey);
  }

  function renderGallery(images) {
    const grid = document.getElementById("gallery-grid");
    if (!grid) return;

    grid.innerHTML = "";

    if (!images.length) {
      statusMessage("warning", `No images were listed in <code>${getFolder()}/gallery.json</code>.`);
      return;
    }

    statusMessage("", "");

    let remaining = images.length;
    let loaded = 0;

    images.forEach((image) => {
      const figure = document.createElement("figure");
      figure.className = "gallery-item";

      const button = document.createElement("button");
      button.type = "button";
      button.className = "gallery-image-button";
      button.setAttribute("aria-label", `Open ${image.title}`);

      const img = document.createElement("img");
      img.src = image.src;
      img.alt = image.title;
      img.loading = "lazy";

      img.addEventListener("load", () => {
        loaded += 1;
        statusMessage("", "");
      }, { once: true });

      img.addEventListener("error", () => {
        remaining -= 1;
        figure.remove();

        if (remaining <= 0 && loaded === 0) {
          statusMessage("warning", `Images are listed, but none loaded from <code>${getFolder()}</code>. Check file names and capitalization.`);
        }
      }, { once: true });

      const caption = document.createElement("figcaption");
      caption.textContent = image.title;

      button.appendChild(img);
      figure.appendChild(button);
      figure.appendChild(caption);
      grid.appendChild(figure);

      requestAnimationFrame(() => {
        figure.classList.add('is-visible');
      });

      button.addEventListener("click", () => openDialog(image));
    });
  }

  async function loadGallery() {
    if (document.body.dataset.page !== "lab-pics") return;

    statusMessage("", "Loading lab photos…");

    try {
      const images = await fetchGalleryImages();
      renderGallery(images);
    } catch (error) {
      statusMessage("error", "Unable to load lab photos.");
    }
  }

  function openDialog(image) {
    const dialog = document.getElementById("image-dialog");
    const dialogImage = document.getElementById("dialog-image");
    const dialogCaption = document.getElementById("dialog-caption");

    if (!dialog || !dialogImage || !dialogCaption) return;

    dialogImage.src = image.src;
    dialogImage.alt = image.title;
    dialogCaption.textContent = image.title;
    dialog.showModal();
  }

  function setupDialog() {
    const dialog = document.getElementById("image-dialog");
    const closeButton = document.querySelector(".dialog-close");

    if (!dialog || !closeButton) return;

    closeButton.addEventListener("click", () => dialog.close());

    dialog.addEventListener("click", (event) => {
      const rect = dialog.getBoundingClientRect();
      const clickedBackdrop =
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom;

      if (clickedBackdrop) dialog.close();
    });
  }


  function setupReactiveEffects() {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return;

    const cursorGlow = document.querySelector('.cursor-glow');
    if (cursorGlow) {
      let targetX = window.innerWidth * 0.5;
      let targetY = window.innerHeight * 0.3;
      let currentX = targetX;
      let currentY = targetY;

      window.addEventListener('pointermove', (event) => {
        targetX = event.clientX;
        targetY = event.clientY;
      }, { passive: true });

      function animateGlow() {
        currentX += (targetX - currentX) * 0.12;
        currentY += (targetY - currentY) * 0.12;
        cursorGlow.style.setProperty('--x', `${currentX}px`);
        cursorGlow.style.setProperty('--y', `${currentY}px`);
        requestAnimationFrame(animateGlow);
      }

      animateGlow();
    }

    const revealItems = document.querySelectorAll('.reveal-on-scroll, .research-card, .people-card, .publication-band, .gallery-item');

    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry, index) => {
        if (!entry.isIntersecting) return;
        entry.target.style.transitionDelay = `${Math.min(index * 45, 220)}ms`;
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      });
    }, { threshold: 0.14, rootMargin: '0px 0px -8% 0px' });

    revealItems.forEach((item) => revealObserver.observe(item));

    const tiltItems = document.querySelectorAll('.research-card, .people-card, .gallery-item');

    tiltItems.forEach((item) => {
      item.classList.add('reactive-tilt');

      item.addEventListener('pointermove', (event) => {
        const rect = item.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width;
        const y = (event.clientY - rect.top) / rect.height;
        const rotateY = (x - 0.5) * 5.5;
        const rotateX = (0.5 - y) * 5.5;

        item.style.setProperty('--tilt-x', `${rotateX}deg`);
        item.style.setProperty('--tilt-y', `${rotateY}deg`);
        item.style.setProperty('--lift', '-2px');
        item.style.setProperty('--spot-x', `${x * 100}%`);
        item.style.setProperty('--spot-y', `${y * 100}%`);
      }, { passive: true });

      item.addEventListener('pointerleave', () => {
        item.style.setProperty('--tilt-x', '0deg');
        item.style.setProperty('--tilt-y', '0deg');
        item.style.setProperty('--lift', '0');
        item.style.setProperty('--spot-x', '50%');
        item.style.setProperty('--spot-y', '50%');
      });
    });

    const heroArt = document.querySelector('.hero-art-frame');
    if (heroArt) {
      window.addEventListener('scroll', () => {
        const y = window.scrollY;
        heroArt.style.transform = `translateY(${Math.min(y * 0.025, 12)}px)`;
      }, { passive: true });
    }
  }


  document.addEventListener("DOMContentLoaded", () => {
    setupDialog();
    setupReactiveEffects();
    loadGallery();

    const refresh = document.getElementById("refresh-gallery");
    if (refresh) refresh.addEventListener("click", loadGallery);
  });
})();
